**Latest 2026-09-25:** eight managed migrations are applied; migration 008 adds the engagement type with existing budgets defaulting to retainer. Restricted-role migration, repeated no-op and guard pass; migration login is disabled. Current application and recovery evidence: [monthly revenue](../../revenue-report/README.md). Earlier migration counts below are historical.

# Managed Atrium baseline

**Current 2026-09-25:** seven migrations are applied. The additive resource-planning migration, restricted runtime guard, live backup and independent restore pass; migration login is disabled. See [resource planning](../../resource-planning/README.md). The six-migration statements below describe the original baseline.

The six migrations here were applied to staging `saedetvoolpdysiyjwvg` over verified TLS on 2026-09-23 using only the `gc_migrate` credential. Reapplication was a no-op. The application, gateway and lifecycle schema guards pass under their restricted roles. The temporary migration login was disabled afterward; all six portal roles remain NOLOGIN. Runtime login credentials and a deployed application are still outstanding. Evidence: `../../supabase-managed-atrium-evidence.json`.

The five original `portal/foundation/migrations/` files and their checksums are unchanged. This separate baseline changes their explicit `public` namespace to `gc_atrium` and omits schema creation, because the administrator pre-provisions it. A sixth migration grants private enum/domain usage only to Atrium runtime roles. The new manifest records source and derived hashes. Do not rewrite these now-applied files; add an ordered migration for subsequent changes.

The managed migrator requires the `gc_atrium` current schema, preserves transaction/advisory-lock and checksum/ledger behavior, and fingerprints only Atrium objects. Documenso objects must have their own owner, baseline and ledger; the separate [Documenso managed history](../managed-documenso/README.md) is now applied. The Prisma connection sets `schema=gc_atrium`; raw PostgreSQL clients use the restricted role's schema search path. Privileged functions retain fixed schema paths and explicit execution grants.

## Reproduce locally

Build the pinned original application images, then run the managed overlay:

```sh
sh portal/foundation/run.sh portal/checkouts/atrium
sh portal/deployment/supabase/managed-atrium/run.sh
```

Both runs use disposable private Docker networks/volumes and synthetic data. The managed fixture includes a same-named user table in the private Documenso namespace; Atrium cannot read it, and its scoped migrations/restore do not overwrite it. The managed overlay mounts its migration runner, locked baseline, connection wrapper and scoped recovery script over the original images. It does not install host packages or modify the pinned checkout. CI runs the managed suite immediately after building the original images.

The full pinned AppModule passes invited signup, captured verification email, verified sessions, account/catalog handoff, canonical artifact-copy permission checks, and replay/membership/revocation denials using non-owner Prisma credentials. The fixture still replaces mail/storage/payment dependencies; this is not a production API image or live staging authentication acceptance. Verified TLS, restart persistence, schema drift and migration-ledger tampering checks, isolated database/artifact restore and overwrite refusal also pass.

Recovery dumps only `gc_atrium` and `portal_meta`, not Supabase platform or Documenso namespaces. Restore keeps the administrator-owned schema setup and excludes only those schema-creation entries from the archive; it refuses populated destinations. This is a local synthetic-artifact restore, not managed off-host recovery or the separate real signed-PDF recovery drill.

## Staging operations

`staging-migrate.mjs` requires the selected dedicated staging project, PostgreSQL 17, verified TLS and a migration-only connection file. It never receives the administrator connection or runs schema push. `staging-verify.mjs` uses the administrator only to assume the restricted roles inside rolled-back transactions, verifies their guards and permission denials, checks all six login switches are off, and confirms public and Data API schemas remain empty. Credentials and CA files are mounted read-only, outside the repository; outputs contain only nonsecret evidence. The empty-project isolation bootstrap must not be run after this migration.

Next gates: off-host operational recovery, scoped runtime credentials, deployable application images/configuration, and managed recovery. Phase 2 is not accepted.
