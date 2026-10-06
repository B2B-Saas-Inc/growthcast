# Managed Documenso migration history

Applied to staging `saedetvoolpdysiyjwvg` in private `gc_documenso`: 164 upstream migrations, one restricted-runtime permissions migration and one versioned restore-stable fingerprint migration (166 total). The migration job received only its scoped credential and verified the database certificate/hostname over session pooling. Reapplication and the namespace-scoped schema guard pass. The temporary migration login is disabled; all six portal roles remain NOLOGIN. Live verification also rechecks the Atrium application/gateway/lifecycle guards and cross-schema/API denials. Evidence: `../../supabase-managed-documenso-evidence.json`.

## Provenance and changes

The manifest pins commit `389390c884949fe27c240488a3259da3cdba93e0`, the application image digest, Prisma schema hash and every original/derived migration hash. `provenance.check.cjs` compares them against the pinned image. Upstream SQL retains its comments/notices; its license is in `UPSTREAM-LICENSE`.

This preserves historical data migrations, subscription defaults, the deleted-account system record, ID functions and indexes. It is not just a generated Prisma table diff. Reviewed adaptations:

- Qualify the deleted-account migration's explicit public references with `gc_documenso`.
- Provision pgcrypto and pg_trgm administratively in `extensions`; migrations receive schema usage, not extension-install privileges.
- Qualify pgcrypto random bytes and trigram operator classes explicitly so Prisma's private schema search path works.
- Give the provider runtime ordinary native-table/sequence/type/function privileges, but no DDL, role escalation or migration-ledger writes. ID functions have fixed private search paths and no PUBLIC execution.

These files are now applied and immutable. Add reviewed ordered migrations for later changes; never run the upstream automatic migration entrypoint against this project. The provider runs the pinned server entrypoint with `schema=gc_documenso` in its Prisma URL. Its role also has that default schema for raw queries. Runtime startup still needs the deployed read-only guard wrapper and managed credentials.

The migrator uses a session advisory lock and commits each migration plus checksum/fingerprint atomically. PostgreSQL enum additions must commit before later migrations use their new values. A failure can therefore leave a valid applied prefix; resuming checks that prefix and its fingerprint before continuing. Use direct or session connections, never transaction pooling. The metadata lives inside the provider namespace and is read-only to runtime.

## Local reproduction

```sh
docker build -f portal/deployment/Dockerfile.supabase -t growthcast-supabase-preflight portal
sh portal/deployment/supabase/managed-documenso/run.sh
```

The runner overlays the established private gateway harness without modifying its original migration path. The actual pinned provider runs as `gc_documenso`, never the owner. Checks pass for 32 gateway cases, native sequential/parallel/rejection and SDK signing, four cryptographically verified final PDFs, 588 route/binding denial probes, organization isolation, gateway restart, expiry and revocation. No signer accounts are created. Migration idempotence, schema drift rejection, runtime DDL/ledger/role denials also pass.

The local provider database retains the harness's internal trust authentication; verified TLS is independently proven for the live Supabase migration. Do not treat this fixture as production credentials or network topology. The [private-schema recovery overlay](recovery/README.md) now restores ownership, ACLs, records and four signed PDFs successfully, rejects tampering/overwrite and resumes healthy services. Fingerprint version 2 fixes physical-column renumbering during logical restore without rewriting the original 165 migrations.

## Remaining gates

Scoped runtime login credentials, reproducible production packaging and guard entrypoints, private backing services, live staging flows, off-host operational recovery remain outstanding. No portal application is deployed, and Phase 2 is not complete.
