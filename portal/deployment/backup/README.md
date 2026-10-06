# Dedicated backup identity and workload foundation

The live staging project now has a separate `gc_backup` SCRAM login. The six application/migration roles remain NOLOGIN. The new role has no memberships, inheritance, superuser, role/database creation, replication or RLS-bypass privileges. Its session default is read-only; actual write/escalation tests also run with that default disabled to prove that privileges enforce the boundary.

`provision.sql` grants SELECT on current and future tables/sequences in `gc_atrium`, `gc_documenso` and `portal_meta`, with schema usage. It runs grants/default-grant changes under the explicit non-inheriting schema owners. No owner role is granted to the backup login. These reviewed operational permissions are separate from the immutable application migration histories; existing schema guards continue to pass. Do not rerun provisioning against an existing backup identity or silently rotate its password.

The administrator-owned `gc_backup_meta.storage_objects` security-barrier view exposes only ID, bucket, object key and metadata for `gc-atrium-private`. `gc_backup` cannot directly query `storage.objects` or `auth.users`, execute private application functions, mutate private tables/sequences, create private-schema objects, or assume application/migration/administrator roles. API roles have no usage on the backup metadata schema. Application signing grants were not changed. A separate reviewed Storage policy upgrade grants the backup Auth identity read-only object access.

## Credential and AWS task role

The dedicated connection, verified public CA and read-only Storage credential are stored in Secrets Manager as `growthcast/portal/staging/backup-database`; its ARN/version are recorded in `secret-evidence.json`. No administrator, application database or Storage writer credential is included. `add-storage-secret.py` performs the reviewed schemaVersion 1 → 2 extension, verifies a pending version, and promotes it only after read-back; the previous version is retained. The local protected connection copy remains for operator drills. Secret content was read back and compared without emitting values. Rotation requires a coordinated database/secret update and renewed capture verification; automatic database-password rotation is not configured.

The retained archive CloudFormation stack also creates `growthcast-portal-staging-backup-task`. Its trust is restricted to ECS tasks in this account/region. It can fetch this one secret, create staging archive objects, wrap data keys under the archive KMS context, and emit metrics only in `GrowthCast/PortalRecovery`. It cannot read/delete archives, unwrap keys, change the secret or read unrelated secrets. Twelve identity-policy simulations and trust inspection pass; the separately packaged [ECS backup job](job/README.md) now has live one-off execution and independent archive recovery evidence. No scheduler is enabled. Policy simulation alone is not runtime credential-delivery acceptance.

Secrets Manager adds $0.40/month for this credential plus API usage; see [AWS pricing](https://aws.amazon.com/secrets-manager/pricing/). The [ECS task-role guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html) supports the account/region-scoped trust policy. Current sources are saved in ignored `.firecrawl/aws-secrets-manager-pricing.md` and `.firecrawl/aws-ecs-task-roles.md`.

## Verification

Local policy test, included in `deployment/check.sh`:

```sh
sh portal/deployment/backup/check.sh
```

The live permission check uses a container with only `backup-database-url` and the CA mounted, never the administrator credential. It checks verified TLS, default read-only behavior, both schema guards, role membership, private function execution denial, platform-schema isolation, DDL/DML and role-assumption denials. The application startup wrapper also explicitly rejects backup credentials.

Run the full managed-source archive/restore drill with the administrator database mount replaced:

```sh
PORTAL_BACKUP_DATABASE=1 \
PORTAL_OFFHOST_RECEIPT=/tmp/growthcast-readonly-backup-transfer.json \
sh portal/deployment/managed-recovery/run.sh
```

The capture uses the filtered metadata view and exports both dumps directly as the backup reader, without assuming migration roles. The restored target provisions a disabled backup role so ACLs/default grants restore correctly. Data/ACL comparisons, both guards, KMS key recovery, tamper and target-overwrite checks pass. The capture now mounts only the database and Storage readers. Separate fixture setup/cleanup containers use the writer to create/remove the journaled synthetic object. The separate [all-object capture](CAPTURE.md) now reads all objects and validates application bindings against one exported database snapshot; it rejects an attempt if object metadata changes. It has a manual independent restore runner but is not deployed or scheduled.

## Remaining deployment work

The [operations contract](../offhost/operations.md) remains disabled. The digest-pinned ECS job and execution role are deployed; one-off task credential/secret retrieval, capture, KMS wrapping, create-only uploads, versioned upload receipts and metric emission pass. Durable independent verification records and hourly freshness monitoring now pass live checks; see [monitoring](verification/README.md). Notification routes are enabled for the confirmed recipient; SNS accepted the labeled delivery test, with inbox receipt confirmed by the operator. Backup scheduling and unattended restore validation remain open. Replacement-project/bucket recovery and restored application startup remain separate gates.

[Combined evidence](evidence.json), [secret receipt](secret-evidence.json) and [workload-policy evidence](workload-evidence.json) record the bounded result. Final source inventory is empty and the operator session broker has zero retained access keys.

Current staging operations: daily backup at 06:00 UTC followed by independent restore is enabled and passes real scheduler acceptance. See [orchestration](orchestration/README.md). Earlier one-off evidence records the schedule state at its capture time.
