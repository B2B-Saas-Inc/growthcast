# Isolated restore verifier package

This package runs the existing managed database and object restore checks in one non-root container. PostgreSQL listens only on a private Unix socket. The acceptance runner disables networking, drops all capabilities, uses a read-only root filesystem and provides bounded temporary filesystems. The container receives only an authenticated decrypted archive, mounted read-only; it has no source credentials or AWS role.

The package restores both private schemas and objects, compares table counts and row digests, ownership and effective ACLs, checks both migration guards and role/API permission denials, and confirms restored application logins are disabled. A second restore must refuse the occupied target, followed by another successful verification. The exit trap stops PostgreSQL and removes temporary database, object and diagnostic files.

```sh
docker build -f portal/deployment/backup/restore-worker/Dockerfile -t growthcast-restore-worker portal
python3 -B portal/deployment/backup/job/restore-check.py
```

The latter command fetches exact S3 object versions and decrypts through the separate restore role, then runs this package before the existing Compose-based verifier. Both must match the original upload receipt before a verification record is published. It does not create source fixtures or capture a new backup.

## ECS worker

`cloud.mjs` accepts only a receipt key and exact S3 version. It validates the receipt and key-envelope bindings, downloads exact versions, decrypts with the dedicated contextual KMS permission, verifies archive SHA-256 and authenticated encryption, runs the packaged restore and checks counts against the receipt before publishing an append-only verification record. A validated receipt whose restore fails produces a FAILED record when publication is available. Invalid receipts or task startup failures cannot produce a trusted record; independent freshness monitoring still detects the absence of fresh verification.

The ECS task uses a dedicated role with archive reads, contextual KMS decryption and verification-prefix create/read permissions. It cannot read source secrets, upload archives, delete records or assume another role. It runs as UID 70, with a read-only root filesystem, no ingress, HTTPS-only egress and ephemeral work volumes. PostgreSQL listens only on a private Unix socket. Unlike the network-disabled local acceptance container, the cloud container needs AWS egress; its child verifier shares the task boundary. No source credential is mounted or retrieved.

```sh
python3 -B portal/deployment/backup/restore-worker/deploy.py
python3 -B portal/deployment/backup/restore-worker/policy-check.py
python3 -B portal/deployment/backup/restore-worker/cloud-check.py
```

Deployment and cloud acceptance refuse silent repetition. The deployed image is pinned by registry digest. The acceptance runner only submits a task and observes bounded logs; archive retrieval, decryption, restoration and verification publication happen inside ECS without operator credentials.

The [daily workflow](../orchestration/README.md) now passes each completed backup’s exact receipt to this verifier and is enabled at 06:00 UTC. This does not prove replacement-project recovery or start the restored portal applications. Production-volume capacity/retry/RPO/RTO acceptance remains separate.

The deployed stopped-task notification rule now covers both backup and restore task families, including nonzero exits and pre-start failures, and excludes successful tasks and the monitor family. Nine AWS event-pattern cases pass. The SNS target path was exercised by the earlier intentional backup failure; a verifier-specific failure email has not been separately injected.
