# Private-schema provider recovery

Run `sh portal/deployment/supabase/managed-documenso/run.sh` to create fresh signed fixtures and exercise this recovery overlay. It uses disposable Docker networks/volumes, never the live Supabase database.

The source services stop while the restricted migration role dumps only `gc_documenso`, including ACLs. The existing gateway fixture dump and four signed PDFs, canonical references, grant bindings and verification certificate join the encrypted archive. AES-256-GCM authenticates the archive before extraction; wrong keys and tampered ciphertext are rejected. The archive key is stored separately.

A fresh recovery database receives administrator-provisioned schemas, restricted roles and extensions. Restore runs as `gc_documenso_migrate` and preserves ACLs, while keeping the pre-provisioned schema. All provider relations belong to that migration role. Verification connects as `gc_documenso`, checks the schema guard, and rejects DDL, migration-ledger writes, migration-role assumption and cross-schema access. API roles cannot use the provider schema or its ID functions. A synthetic Atrium sentinel survives unchanged. Migration login remains disabled on the target.

All four restored PDFs pass OpenSSL signature/full-revision checks; database/file hashes, provider team/status, canonical references, recipient grants and sessions agree. Restoring over the populated target is refused and verification passes again. Source containers resume without rerunning preparation or migrations; the runner waits for provider health before continuing browser boundary/expiry/revocation tests.

## Restore-stable fingerprint

The original fingerprint included physical PostgreSQL attribute numbers. Historical column drops leave holes in those numbers; logical dump/restore compacts them and caused a false schema-drift failure. Migration `99999999999999_schema_fingerprint_v2` adds an explicit format version. Version 2 compares visible column order while retaining names, types/defaults, constraints, indexes, triggers, functions and enums. Real added-column drift still fails. The preceding 165 migration hashes are unchanged.

The frozen `legacy-v1` test fixture first recreates the original applied history, then verifies the versioned upgrade. The live staging upgrade also passed with verified TLS, followed by both application guards and permission checks; the temporary migration login was disabled. See `../../../supabase-managed-documenso-evidence.json`.

This closes the local private-schema provider recovery gap. It is not an off-host Supabase restore or a production recovery-time guarantee. Local databases retain fixture trust authentication, the gateway remains its separate legacy fixture database, and the archive/key/plaintext volumes are removed after the run. Production storage/retention, key recovery, restore identities, runtime credentials and operational RPO/RTO remain outstanding.

## Optional off-host archive round trip

The explicit `PORTAL_OFFHOST_RECOVERY=1` overlay now exercises this same restore using an encrypted archive downloaded from a dedicated S3 bucket. It removes the original local ciphertext before fetching the exact remote version; the SHA-256, wrong-key/tamper denials, ownership/ACL and four-PDF checks pass. See [command, credential boundary and limitations](../../../offhost/README.md). The default invocation remains entirely local. This extension does not back up live Supabase schemas or private Storage objects.
