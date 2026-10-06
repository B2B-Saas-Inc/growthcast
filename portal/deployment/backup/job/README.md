# Staging backup workload

This package captures the private Supabase schemas and bucket with the dedicated readers, encrypts the bounded archive with a fresh AES-256-GCM key, wraps that key through KMS, and uploads envelope, archive and receipt with create-only S3 writes. An upload receipt records exact object versions and SHA-256. It remains `UPLOADED` / `pending-independent-restore`; the writer cannot declare its own archive verified.

The image pins Node/PostgreSQL base digests and all npm dependencies through `npm ci`. It includes only capture code and migration guards, runs as UID/GID 10001 with a read-only root filesystem and no Linux capabilities, and uses a private ephemeral `/work` volume. Neither fixture writers nor administrator credentials enter it. Source credentials and plaintext output are removed in a final cleanup block. The per-archive key stays in memory and is cleared after use.

`main.mjs` uses the SDK container credential provider explicitly. It requires the ECS relative metadata endpoint and rejects static keys, named profiles and arbitrary credential URLs. It retrieves only the existing version-2 source secret. The child capture receives only source/output paths and PATH in its environment. Both processes share the container’s task IAM boundary. HTTPS requests use fixed AWS region/account configuration; source validation pins the reader identities, project, pooler and public CA fingerprint.

The job emits bounded `STARTED`, `CAPTURED`, `UPLOADED` or `FAILED` status and upload/failure metrics in `GrowthCast/PortalRecovery`. Capture has a 20-minute timeout; AWS operations have a 25-minute deadline. Failure metrics get a separate bounded attempt. Start failures and missing metrics still require an independent freshness monitor, which is not deployed here. Partial envelope/archive uploads can remain after failure and expire under the archive lifecycle; no success receipt is accepted before all three writes return version IDs.

## Deployment

`foundation.json` creates a dedicated immutable-tag ECR repository, ECS cluster, seven-day log group, isolated VPC/subnet and an execution role limited to this image and log group. The task uses the already scoped backup task role. There is no service, listener, ingress rule, NAT gateway, schedule or notification. A one-off Fargate ARM64 task uses 1 vCPU, 2 GiB RAM and an ephemeral public IPv4 address for outbound HTTPS/database TLS. Traffic is limited by its security group to outbound TCP 443/5432; this is not a destination allowlist.

`deploy.py` verifies the AWS account, records and checks CloudFormation changes before execution, publishes the locally tested image using a temporary registry login, pins its ECR digest into the task definition, and launches one task. It refuses an already deployed task definition rather than silently replacing it. Task polling is bounded and explicitly stops an overdue acceptance task. It creates no recurring execution.

```sh
sh portal/deployment/backup/job/check.sh
sh portal/deployment/backup/job/source.check.sh
python3 -B portal/deployment/backup/job/deploy.py
python3 -B portal/deployment/backup/job/restore-check.py
# Optional explicit three-file acceptance against the existing deployed image:
python3 -B portal/deployment/backup/job/multi-object.check.py
python3 -B portal/deployment/backup/job/restore-check.py
```

The first command verifies the package offline. The second is an explicit live read-only capture using separately mounted reader credentials; it retains no archive. The last command independently retrieves the deployed upload's exact receipt/archive/envelope versions with the restore role, recovers the KMS key, decrypts and verifies isolated local restoration. It checks wrong-key/tamper denial, data/ACL/reference integrity, both application guards and target-overwrite refusal. The operator restore still uses the temporary broker bootstrap; the ECS backup itself does not.

Current AWS guidance: [container credentials](https://docs.aws.amazon.com/sdkref/latest/guide/feature-container-credentials.html), [conditional S3 writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), and [ECS volume ownership](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html). Captures are in ignored `.firecrawl/aws-container-credentials.md`, `aws-conditional-writes-job.md` and `aws-ecs-bind-mounts-job.md`.

## Remaining gates

One-off execution does not establish scheduled backup health. Durable independent verification records and hourly freshness monitoring now pass live acceptance; see [monitoring](../verification/README.md). Notification routes are enabled after SNS subscription confirmation; the labeled delivery test was accepted by SNS, with inbox receipt confirmed by the operator. Scheduled backup/restore verification, operational retry/capacity acceptance and replacement-project application recovery remain open. No messages are sent and no schedule is enabled by this package.

Deployment and independently restored one-off acceptance are recorded in `deployment-evidence.json`, `empty-restore-evidence.json` and `restore-evidence.json`. The initial AWS CLI session expired before provisioning and was renewed by the operator. No credential or upstream response body was logged.

The independent restore check now also requires the isolated verifier image: build it with `docker build -f portal/deployment/backup/restore-worker/Dockerfile -t growthcast-restore-worker portal`. See [package and evidence](../restore-worker/README.md).

Current staging operations: daily backup at 06:00 UTC followed by independent restore is enabled and passes real scheduler acceptance. See [orchestration](../orchestration/README.md). Earlier one-off evidence records the schedule state at its capture time.
