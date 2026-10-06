# Phase 2: local deployment foundation

Status: local database foundation implemented; Phase 2 remains in progress. This is not the complete Atrium/Documenso application stack. Phase 1's commercial decisions are resolved by operator confirmation; see [acceptance](../docs/phase-1-acceptance.md).

## Reproduce

Use Docker for dependencies and verification. Supply clean source checkouts at the revisions in `../upstream-lock.json`:

```sh
sh portal/foundation/prepare-checkouts.sh /absolute/path/to/atrium /absolute/path/to/documenso
sh portal/foundation/run.sh portal/checkouts/atrium
```

The first command creates ignored local branches under `portal/checkouts/`, retains the original `upstream` remotes and license notices, and refuses mismatched or dirty sources. It does not create remote forks or push anything. The runner archives the pinned Atrium commit into a temporary build context, installs frozen dependencies in digest-pinned containers, regenerates the baseline and compares its hash with the checked-in migration manifest. Its temporary Compose project has no published ports and is removed with its own volumes on exit. No shared Docker resources are pruned. The GitHub workflow is manual-only and runs the same disposable check without deployment credentials.

## Migration and credential boundary

`001-atrium.sql` is the pinned Prisma schema's empty-database baseline. `002-provider-adapters.sql` freezes the existing gateway and Atrium adapter schema. `003-runtime-permissions.sql` defines the candidate application role. `004-account-handoff.sql` adds a narrowly scoped artifact-copy function; `005-gateway-role.sql` adds the dedicated gateway privileges and read-only schema metadata grants; existing migrations retain their original checksums. These are a new-database baseline, not an upgrade or data migration for an existing installation.

Provisioning creates separate random SCRAM credentials for the administrator, `gc_migrate`, `gc_app` and `gc_lifecycle`. Only the explicit migration job receives migration credentials. The runtime container receives its application credential and public database CA, with no provisioning secrets or database private key. PostgreSQL requires TLS; clients verify the certificate and hostname. The generated two-day certificate is a disposable test credential.

The migrator validates file hashes, takes a transaction-scoped advisory lock, applies pending migrations atomically and records their checksums plus a catalog fingerprint. Reapplication is a no-op. The startup guard only reads schema state and refuses missing migrations, modified checksums or schema drift. It never runs schema push. Future changes require a new ordered migration and manifest entry; do not rewrite an applied migration. The fingerprint covers columns/defaults, constraints, indexes, triggers, functions and enums; it is not a complete PostgreSQL security audit.

The application role can operate native Atrium records but cannot create schema objects, overwrite migration metadata, assume the migration role or directly rewrite provider-owned completion/artifact truth. The lifecycle role retains its restricted function grants. The foundation now compiles and boots the full pinned Atrium AppModule with its real PrismaService under `gc_app`, after the read-only schema guard succeeds. Invited signup, captured verification email, account verification and session retrieval pass over verified database TLS; uninvited signup, DDL and direct sealed-artifact writes are denied. Mail, storage and Stripe dependencies are replaced with local test implementations and the container has no external network access. The combined catalog/signing harness now uses the same reviewed migrations and TLS controls, with restricted application clients plus separate gateway/lifecycle roles: the foundation now covers scoped artifact projection, claims, authenticated catalog HTTP listing/opening and gateway store redemption under the restricted role using synthetic canonical completion data. The combined HTTP API is now a separate restricted container; only the test driver retains privileged fixture clients. Production adapters, managed secrets and staging deployment remain outstanding. This is an application integration test image, not a production API image.

## Persistence and recovery evidence

The runner verifies:

- Migration manifest integrity and release-preflight rejection of incomplete configuration.
- Unmigrated startup denial, atomic/idempotent migration and runtime permission denials.
- Restricted catalog/claim/gateway authorization, canonical sealed-reference copying, one-use replay rejection, wrong identity/session, membership removal, revocation and function execution denial for the lifecycle role.
- Verified TLS, rejection of plaintext/untrusted CA/wrong hostname, and failed migration login using the runtime password.
- Real Atrium user, organization, project, document and file rows plus a synthetic artifact surviving database restart. The account and session created through the actual auth routes are also checked after restart and isolated restore.
- Schema drift and migration-ledger tampering rejected by both startup and migration checks.
- Database dump and artifact archive checksums; restore into a separate empty database and artifact volume; restored row ownership, byte length/hash, schema guard and runtime restrictions.
- Refusal to overwrite the populated restore destination, followed by re-verification of that destination.

The synthetic artifact is a marker fixture, not a cryptographically signed contract. Source writes are quiescent during this drill. Backups are plaintext in disposable private volumes and deleted after the run. Production needs encrypted/versioned off-host storage, coordinated snapshots while writes are active, retention, signing-key escrow, and operational recovery. The separate [encrypted provider drill](../recovery/README.md) now restores actual Documenso/gateway fixture data and four signed PDFs, verifying signatures, hashes, grants and canonical references. It remains local and disposable. RPO/RTO are not established by this test.

## Release preflight and remaining Phase 2 work

`compose.production.yaml` and its staging overlay run **only a release preflight**, not application services or an edge proxy. `.env.example` contains no credentials. `release.json` deliberately has no approved images or final signing-certificate policy; validation exits nonzero until those inputs exist. The validator checks configuration shape, digest pins and HTTPS/origin constraints; it cannot authenticate an approval or license. Do not change its status just to obtain a green check.

Remaining before Phase 2 acceptance:

- Complete production application builds for Atrium web/API, gateway, worker and Documenso. The combined local harness already covers the catalog, provider projection, gateway and lifecycle flows.
- Complete staging/production service topology, private provider ingress, HTTPS proxy, egress restrictions and browser/API isolation checks.
- Review existing Supabase capabilities before selecting/provisioning supporting secrets, storage and TLS services. The former RDS/AWS proposal is withdrawn; see `../deployment/README.md`.
- Carry the combined harness’s isolated SMTP capture and synthetic-recipient restriction into the deployable staging topology.
- Exercise off-host recovery with selected production storage/key controls and agreed operational recovery targets. Local persistence and actual provider database/artifact restore now pass.

No deployment, vendor communication, purchase or legacy proposal cutover is performed by this milestone.

## Account artifact handoff

`copy_account_artifacts(uuid)` runs with a fixed schema search path and no PUBLIC execution permission. Only the application role receives execution permission. It copies existing canonical completion references to an account-derived grant after rechecking live session, verified recipient email, organization/project membership, document version/file, source generation/revocation/expiry, child binding and child expiry. It accepts no artifact IDs or hashes from the caller. The shared claim implementation inserts the account context before calling this function in the same transaction. Direct application writes to `sealed_artifacts` remain forbidden. This bounds elevated artifact-copy authority; it is not a defense against total compromise of all native account tables writable by the application role.

The foundation seeds its canonical completion through an isolated fixture job with migration credentials. It does not claim that fixture is a production lifecycle ingress or that the synthetic artifact is a signed PDF. The existing combined Documenso runner separately checks real signing and PDF behavior.

## Managed Supabase baseline

The original five migration checksums remain unchanged. A separate [managed Atrium baseline](../deployment/supabase/managed-atrium/README.md) now uses gc_atrium, pre-provisioned schema ownership, private type permissions and a scoped fingerprint. Its real AppModule/TLS/restart/restore suite passes locally; all six migrations are applied and permission-verified in staging. The separate managed Documenso history is also applied; deployable runtime configuration and off-host operational recovery remain open.
