# Live staging Supabase snapshot recovery

This explicit, bounded operator drill captures the existing staging project's private schemas and one synthetic Supabase Storage object, transfers an authenticated encrypted archive through the independent S3 destination, and restores into isolated local targets. It is not a production recovery procedure or a restore into the source project.

```sh
docker build -f portal/deployment/managed-recovery/Dockerfile -t growthcast-managed-recovery portal
PORTAL_OFFHOST_RECEIPT=/tmp/growthcast-managed-recovery-transfer.json \
sh portal/deployment/managed-recovery/run.sh
```

The protected source configuration defaults to `~/.config/growthcast/portal-staging`; override `PORTAL_STAGING_SECRETS` only with an equivalent protected folder. The capture job alone mounts `database-url`, the verified Supabase CA and the bucket-scoped storage credential. No credentials or source configuration enter the archive. The cleanup job receives only the scoped storage credential and the unique object journal. Local dependencies are installed only in the pinned container build.

## Capture boundary

The job is pinned to `saedetvoolpdysiyjwvg` and private bucket `gc-atrium-private`. It requires all six portal roles to remain NOLOGIN, no existing sessions under those roles, and an initially empty bucket. A separate fixture setup container records a unique object key before uploading its synthetic bytes, so cleanup can remove that exact object after an interrupted capture. It does not enable application logins or write application tables.

The administrator connection verifies TLS and uses read-only transactions. One exported repeatable-read PostgreSQL snapshot supplies both `pg_dump` operations: `gc_atrium` plus `portal_meta` under `gc_migrate`, and `gc_documenso` under its migration owner. Dumps preserve ACLs; no source role passwords or Supabase platform schemas are dumped. A manifest records table row counts/content digests, owners/effective ACLs, storage object ID/key/metadata and SHA-256 of the downloaded bytes. Both application schema guards pass. A second read checks that source private data and object metadata/bytes did not change during capture.

This is a closed-staging drill, not an active-write coordination protocol. The default manual source credential is administrative. The `PORTAL_BACKUP_DATABASE=1` overlay replaces that mount with the dedicated `gc_backup` reader, filtered storage metadata view and read-only Storage identity; the complete restore now passes with this restricted identity. See [backup identity](../backup/README.md). The capture journal is mounted read-only. A non-synthetic scheduled capture remains open.

## Independent restore

The existing AES-256-GCM archive code encrypts without network access. The [off-host transfer](../offhost/README.md) uses separate short-lived upload/restore sessions, deletes its local ciphertext before fetching the exact S3 version, and verifies size/SHA-256. The data key is wrapped by the retained KMS key with the exact archive context; only the wrapped envelope is stored in S3. The original local key is removed before restricted-role KMS recovery. Wrong-key and ciphertext-tampering checks run before plaintext is written.

The target PostgreSQL 17 container is on an internal-only network, has no source or AWS credentials and publishes no ports. It refuses an existing target database. Reviewed isolation SQL creates the expected owners and disabled roles. Restore preserves migration ownership and ACLs. Verification compares all captured table counts/content digests and effective privileges, runs both schema guards, and rejects runtime DDL, ledger mutation, migration-role assumption, cross-application access and Data API-role schema access.

PostgreSQL may restore an explicit owner-only ACL as its equivalent default ACL. Comparisons therefore expand defaults and compare grantor, grantee, privilege and grant-option names in stable order; they do not compare the raw nullable catalog representation.

The synthetic object is restored to a separate private local volume under its original key, with create-only writes. Its bytes, length, hash and live-source storage metadata binding must agree. This tests byte/catalog recovery; it does not provision a replacement Supabase Storage bucket or its Auth identity/RLS policies. Those platform settings remain separately versioned configuration and need a replacement-project operational drill.

The parent runner verifies target overwrite refusal, repeats checks after that refusal, removes the exact synthetic source object, and removes disposable local containers/volumes. On source-cleanup failure it retains the journal for diagnosis. The encrypted archive and separately escrowed key are retained; S3 lifecycle expiry is configured by the archive foundation.

Remaining gates: scheduled backups and monitoring, deployed backup workload, replacement-project database/bucket/auth configuration, production-scale active-write coordination, restored application startup and operator RPO/RTO acceptance. Application deployment remains separate.

The complete [evidence](evidence.json) records 107 tables, 223 rows and one 43-byte synthetic object restored successfully. Final independent inventory confirms the source bucket is empty; the session broker has no retained access keys.

The separate [all-object capture](../backup/CAPTURE.md) introduces a version-2 manifest and uses the shared restore verifier. It permits concurrent database DML via one exported snapshot, captures all bucket objects and rejects conflicting object changes. The original runner remains the single-object closed-staging acceptance drill.

Replacement managed PostgreSQL, bucket and service-identity recovery now passes; see `portal/deployment/replacement-recovery/evidence.json`. The disposable target and archive volumes were removed. Restored application startup and production-scale recovery acceptance remain open.
