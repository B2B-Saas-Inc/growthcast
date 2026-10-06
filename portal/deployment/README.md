# Vercel portal with existing Supabase

The operator selected Vercel at `clients.growthcast.app` and corrected the database choice to the existing Supabase setup. **RDS is withdrawn.** The unexecuted AWS change set was deleted on 2026-09-23. Its template is retained only as historical evidence in `superseded/aws-foundation-rds.json`; the previous $69.51 foundation estimate no longer describes the selected architecture.

The protected Vercel staging project exists in team `b2b-saas`. Supabase database/Storage, independent AWS backups and scoped runtime secrets are provisioned; isolated Fargate application startup and account/file flows pass. The Vercel staging project now has a sensitive preview-only API origin proof. No public portal or DNS route is deployed, and the frontend/API-proxy helper is not yet exercised through a live HTTPS route. See `runtime-connections/`, `cloud-account/` and `proxy-secret/` for current evidence; earlier milestone paragraphs below describe point-in-time progress.

## Supabase compatibility review

Supabase provides [custom PostgreSQL roles with Prisma](https://supabase.com/docs/guides/database/prisma) and [direct/session connections](https://supabase.com/docs/guides/database/connecting-to-postgres). The portal's current baseline is not safe to apply blindly to a shared project: it owns `public`, grants privileges on all public tables, and fingerprints the entire public schema. Existing application tables would be affected and unrelated schema changes would trigger drift failures. Do not change applied migrations or run the disposable fixture provisioning script against Supabase.

The dedicated **B2B SaaS Inc.** project `growthcast-clients-staging` is created and healthy: `saedetvoolpdysiyjwvg`, `us-east-1`, Micro compute. Its selected addon reports $0.01344/hour (about $10/month); no PITR, IPv4 or other paid addon was selected. The existing CLI login is stored in macOS Keychain (`Supabase CLI`, account `supabase`) and works through the Management API. Browser sharing or another login is unnecessary. Database credentials are stored outside the repository under `~/.config/growthcast/portal-staging/` with directory mode 0700 and credential-file mode 0600; production secret management remains open.

The initial catalog audit is retained in `supabase-project-audit.json`. Initial isolation evidence is in `supabase-isolation-evidence.json`; current application-baseline evidence is in `supabase-managed-atrium-evidence.json`. Staging has a verified-TLS PostgreSQL 17 session, migrated `gc_atrium` and `gc_documenso` schemas, restricted metadata schema, and **only empty `portal_api` exposed to PostgREST**, with public removed from its extra search path. Six roles have no superuser, database/role creation, inheritance, replication or RLS bypass privileges. They deliberately remain **NOLOGIN** until the managed application baseline and scoped credentials are ready. API roles have no private schema/object access; default function/table/type privileges are closed for the new owners. Existing Supabase public defaults remain platform-owned and do not apply to objects created by the private migration roles.

The first physical backup completed; PITR is disabled. **Atrium's managed baseline is now applied.** Its six separate checksummed migrations preserve the original five foundation migrations. Real AppModule and restore tests pass locally; live idempotence, schema guards and restricted-role denials pass. The temporary migration login was disabled afterward; all six roles remain NOLOGIN. Documenso’s managed history is also applied, with restricted native/SDK signing verified locally and live guards/permission denials passing; see [provider details](supabase/managed-documenso/README.md) and `supabase-managed-documenso-evidence.json`. The private-schema provider recovery drill now passes; runtime credentials, off-host operational recovery and production packaging remain open. See [managed Atrium details](supabase/managed-atrium/README.md).

### Reproduce isolation checks

`sh portal/deployment/supabase/check.sh` runs a pinned, disposable PostgreSQL 17 container with a non-superuser administrator. It checks repeat provisioning, owner separation, default privileges, API read denial, runtime DDL/function denial and refusal to touch populated schemas. No cloud credentials are used.

`supabase/isolation.sql` provisions only empty dedicated schemas and NOLOGIN roles, atomically under an advisory lock. `supabase/isolation-check.sql` creates probe objects and rolls all probes back after checking privileges. Both passed against staging through session pooling with verified TLS. The targeted runner `supabase/isolation-run.mjs apply|verify` uses the same protected credential/CA mounts as the original preflight, and checks the selected dedicated staging project. It temporarily inherits role ownership only for the administrator during provisioning, then removes inherited membership. After credentials or application migrations exist, this empty-project bootstrap must not be rerun. These tests establish namespace isolation, not real application login or end-to-end runtime readiness.

Database TLS enforcement was enabled and verified. An initial API inspection accidentally printed the legacy JWT secret in tool output. Remediation completed while the project was empty: legacy API keys disabled, legacy HS256 signing key revoked, new ES256 signing key active. Subsequent inspection explicitly allowlists nonsecret fields. No application data or migrations existed during that initial inspection/remediation; the managed baselines described above were applied afterward.

### Read-only inspection

The initial public-baseline `supabase-preflight.mjs` only queries PostgreSQL catalogs in a read-only transaction. It reports PostgreSQL major version, public relation count, portal role flags, and potentially exposed default privileges without printing credentials, table data or connection strings. It rejects mismatched projects, transaction-pooler port 6543, insecure TLS settings and unrelated hosts. It forces certificate verification; mount the project's CA if required. For long-lived services and advisory-lock migrations, use a verified direct connection or session pooling where appropriate, not transaction pooling.

Build in Docker:

```sh
docker build -f portal/deployment/Dockerfile.supabase -t growthcast-supabase-preflight portal
```

Run only after identifying the project. Mount a local protected connection-string file read-only at `/run/secrets/database-url`, set `SUPABASE_PROJECT_REF`, and optionally mount the CA and set `SUPABASE_CA_FILE`. Never pass the credential as a command-line argument or commit it. Exit 2 means catalog blockers were found; exit 1 is a redacted connection/configuration failure. Exit 0 is only a preliminary catalog check, **not migration or release approval**.

Remaining live checks include role ownership/function grants, schema/search-path adaptation, Supabase Data API exposure and access through `anon`, `authenticated` and `service_role`, migration locking, pool limits, verified TLS, revoked-grant behavior and restart/recovery. Keep native Atrium auth; choosing Supabase PostgreSQL does not imply replacing it with Supabase Auth.

## Supporting services to reassess

- **Database:** existing Supabase PostgreSQL; dedicated staging project created; isolation and capacity remain to validate. No RDS instance is needed.
- **Private provider and worker:** still require a suitable container runtime. Database reuse alone does not make Documenso or the durable worker run on Supabase. Reassess the previous Fargate/NAT proposal and existing hosting capacity before selecting billable resources.
- **Artifacts:** private Supabase Storage is provisioned and the compiled REST adapter passes live scoped-identity checks. See [storage evidence and configuration](storage/README.md). Files remain behind authorized API download routes; independent object backup remains open.
- **Backups:** verify the project's actual plan and recovery features. [Supabase database backups do not include Storage object bytes](https://supabase.com/docs/guides/platform/backups); signed artifacts still need coordinated recovery. Existing encrypted local recovery evidence remains valid but is not a managed-storage restore.
- **Secrets, certificates, email and registry:** reuse suitable existing services once inventoried. AWS choices in `targets.json` are provisional, not provisioning instructions or accepted costs.

`sh portal/deployment/check.sh` validates the archived template and runs configuration/proxy/Supabase connection and storage-client tests plus disposable PostgreSQL schema/storage-policy isolation suites and managed-baseline source provenance check. The Supabase preflight image builds separately. Live catalog inspection and transactional isolation probes are recorded; both managed application histories are applied; runtime logins remain disabled. See `../docs/phase-2-acceptance.md` for remaining Phase 2 gates.

## Managed startup wrapper

See [runtime startup boundary](runtime/README.md). Exact-role/TLS/schema checks and explicit child environment handling are implemented and container-tested. The pinned Documenso package now integrates the wrapper and passes isolated actual-provider startup/restart/drift tests over TLS/SCRAM. Packaged native/SDK signing, four PDF signatures, restart, expiry and revocation also pass; see `runtime/signing-evidence.json`. The Atrium API package also passes actual-main/AppModule startup, TLS/SCRAM, private-route and uninvited-signup denials, restart and schema-drift refusal. Package-level invited signup, captured SMTP verification, invitation acceptance, organization isolation and session persistence/logout now pass. Private origin-proof ingress and local named-volume storage now pass unauthorized-file, membership-removal and container-recreation checks. Portal adapters, managed storage/recovery, deployed proxy/HTTPS acceptance and live secret provisioning remain open.

## Managed artifact storage

The private Supabase bucket and dedicated service identity are provisioned; compiled-adapter live upload/download/delete and isolation checks pass. [Storage configuration and evidence](storage/README.md) record the REST choice, modern API-key handling, policy SQL and remaining recovery work. Synthetic verification objects and temporary probe resources were cleaned up. Full packaged API-to-managed-storage HTTP now passes upload/download, container recreation, access revocation and verified cleanup; see `runtime/managed-storage-evidence.json`. Deployment acceptance remains open.

## Independent staging archive destination

[Off-host recovery](offhost/README.md) now provisions a dedicated private, encrypted, versioned S3 bucket and scoped upload/restore roles. The downloaded synthetic provider archive passes the full database/four-signed-PDF restore checks. Current/noncurrent archive expiry is configured; no Object Lock or KMS key is claimed. Protected operator key escrow, live Supabase coordinated recovery and scheduled operation remain separate acceptance work.

The [live-source recovery drill](managed-recovery/README.md) now restores a read-only Supabase snapshot and synthetic object bytes from the independent archive into isolated local targets. Replacement-project/bucket recovery, managed key escrow, scheduling and application deployment remain separate gates.

Archive keys now use retained, annually rotated KMS wrapping with separate backup/restore permissions and verified legacy-key migration. See [key-management evidence](offhost/kms-evidence.json). The [proposed schedule and reporting contract](offhost/operations.md) is not enabled.

[Backup identity/workload foundation](backup/README.md) now provides the live read-only database login, managed source credential and ECS-only task role. The full isolated restore passes without the administrator DB credential. Task execution, read-only object capture and scheduling remain open.
