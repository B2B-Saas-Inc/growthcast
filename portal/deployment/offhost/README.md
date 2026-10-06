# Independent encrypted staging recovery

The dedicated private S3 bucket `growthcast-portal-staging-recovery-059393269249` in `us-east-1` stores encrypted recovery archives and KMS-wrapped data-key envelopes. Stack `growthcast-portal-staging-recovery` manages the bucket, scoped roles and the retained KMS key. PostgreSQL and application file storage remain in Supabase.

The bucket blocks public access, disables ACLs, enables versioning/SSE-S3, requires TLS, and requires create-only writes. Current archive/envelope versions expire after 30 days; noncurrent versions expire 30 days after becoming noncurrent. This is lifecycle expiry, not Object Lock or a strict 30-day maximum. CloudFormation retains the bucket and KMS key on deletion/replacement.

## Managed archive keys

Each archive uses a fresh random AES-256-GCM data key and nonce. `managed_keys.py` wraps that data key under the KMS key recorded in `kms-configuration.json`, using authenticated encryption context containing only the staging project and exact archive object key. Context is non-secret and may appear in CloudTrail; it contains no credentials or client identifiers.

Only the isolated KMS client receives the plaintext data key for wrapping. S3 transfer containers receive ciphertext and the wrapped envelope, never plaintext keys. The backup role can `kms:Encrypt` but cannot decrypt; the restore role can `kms:Decrypt` but cannot encrypt. Both permissions require the staging project and archive-path context on this exact KMS key. Neither role can administer the key. The drill verifies uploader-decrypt, restore-encrypt, wrong-project, wrong-archive and modified-ciphertext denials.

`key.kms.json` sits beside its encrypted archive. It contains the KMS key ARN, authenticated context and wrapped ciphertext; possession of it does not grant KMS decryption permission. Receipts pin both S3 version IDs. The drill removes the original local archive and key before downloading those exact versions, recovering the data key through KMS, and performing authenticated decryption and the full restore checks. No persistent plaintext key is needed on the operator machine. `~/.config/growthcast/portal-staging/recovery-keys/<run-id>/` now holds non-secret receipts only.

Automatic annual KMS rotation is enabled. The key is retained on stack removal, with a 30-day pending-deletion window if an administrator explicitly schedules deletion. Rotation preserves recovery of older wrapped keys; it does not rewrite archives. The initial KMS key cost is $1/month plus applicable requests; the first two rotations add monthly key-material charges. See [AWS pricing](https://aws.amazon.com/kms/pricing/), [encryption context](https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html) and [rotation](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html). These current sources are captured in ignored `.firecrawl/aws-kms-*.md`.

## Scoped operator sessions

The upload role has only `PutObject` within `staging/` plus scoped KMS wrapping. The restore role has only `GetObject`/`GetObjectVersion` there plus scoped KMS unwrapping. Neither can delete objects or administer infrastructure.

Only the dedicated session broker can assume these two roles. The current operator login is an AWS root session, which cannot assume roles directly. The explicit drill creates a broker bootstrap key, obtains two 15-minute STS sessions, then deletes that bootstrap key before archive transfer. It checks that no broker keys remain. Only session issuance receives bounded IAM-propagation retries; archive writes are never automatically retried. Automatic workload trust remains unconfigured. Operator AWS configuration never enters a transfer/KMS container.

## Explicit drills

Live staging source, isolated local restore:

```sh
PORTAL_OFFHOST_RECEIPT=/tmp/growthcast-managed-recovery-transfer.json \
sh portal/deployment/managed-recovery/run.sh
```

Synthetic signed-provider fixture:

```sh
PORTAL_OFFHOST_RECOVERY=1 \
PORTAL_OFFHOST_RECEIPT=/tmp/growthcast-offhost-transfer.json \
sh portal/deployment/supabase/managed-documenso/run.sh
```

The provider fixture verifies two databases and four signed PDFs. The [live-source drill](../managed-recovery/README.md) verifies the managed private schemas and a synthetic Storage object's bytes. Wrong-key/tampering, target overwrite, ownership/ACLs and access-denial checks remain in each relevant suite. Source cleanup is verified. These are bounded drills, not a scheduled production backup service or replacement-project failover.

## Historical key migration

`migrate_keys.py --receipt /tmp/growthcast-key-migration.json` migrates only generated staging archive-key directories. Before removing a legacy plaintext key, it downloads the exact existing archive version, verifies SHA-256 and authenticates the AES-GCM ciphertext offline, creates or verifies its wrapped envelope, downloads that envelope and verifies KMS recovery of the original key. It atomically records the envelope version before removing the old plaintext key. Unreceipted pre-upload keys are removed only after confirming no remote object versions exist for their unique run prefix. This operation does not overwrite archives or existing envelopes.

## Remaining operations

[Scheduling and failure reporting](operations.md) defines a proposed daily capture, weekly restore, failure metrics and an independent freshness check. None is enabled. Dedicated source backup identity, active-write/object consistency, deployed workload identity and job runtime, notification routing, replacement Supabase project/bucket/Auth/RLS recovery and restored application startup remain open. Recovery currently assumes the AWS account and `us-east-1` KMS service remain accessible; cross-account/region recovery is not established.

Historical [provider recovery evidence](recovery-evidence.json) and [provisioning audit](provisioning-evidence.json) predate managed key wrapping. The newer key-management evidence records the KMS-backed drill and migration separately.

Current [KMS restore/migration evidence](kms-evidence.json) and [live key/permission audit](kms-audit.json) confirm 107 tables, 223 rows and one object restored with a remotely recovered data key. Four older archive keys were migrated and all local plaintext archive keys removed after verification.
