# GrowthCast client portal implementation

**Production documents live — 2026-09-26:** the completed staging document workflow is now deployed to `https://clients.growthcast.app`: Documents navigation, field/tag preparation, optional-PIN signing, GrowthCast branding/favicon, verified downloads, executed-PDF emails and seven-day link validity. Production keeps its own data, credentials and services; existing accounts/password hashes are unchanged. Ten production browser checks, runtime/access checks and independent data/secret recovery pass. Thirty-minute recovery is restored. See `portal/guest-documents/deployment/production/README.md`.

**Staging signing-link expiry — 2026-09-26:** new signing links follow the approved expiry, up to seven days, while browser sessions remain one hour. Existing links are unchanged. Both PIN modes, expiry/revocation and the full local signing/PDF/email flow pass. See `portal/guest-documents/deployment/expiry-rollout/README.md`. Production unchanged.

**Staging download and favicon fix — 2026-09-26:** native Original/Signed download buttons now resolve through the exact approved/verified PDF versions; browser checks click both buttons and compare file hashes. Signing and confirmation icons now use the existing GrowthCast portal favicon. See `portal/guest-documents/deployment/download-rollout/README.md`. Production unchanged.

**Staging completion email — 2026-09-26:** confirmation screens hide Share and retain Download. The existing delivery worker now sends the verified executed PDF through Workspace SMTP once per completed document. Missing operator test copies were accepted by SMTP. See `portal/guest-documents/deployment/confirmation-rollout/README.md`. Production unchanged.

**Staging recipient signing live — 2026-09-26:** asset-loading failures are fixed; PIN and signing screens use GrowthCast branding. Staff approvals now offer optional PIN, with one email for link-only access or a separate code email when enabled. Both live signing modes, verified project PDFs and protected downloads pass; independent recovery passes and production is unchanged. See `portal/guest-documents/deployment/recipient-rollout/README.md`.

**Staging signing infrastructure — 2026-09-26:** migration013 and separate gateway/lifecycle services are deployed. Integration-secret recovery, private provider API authorization, seven HTTPS checks, ten staff/client browser checks, and independent data restore pass; daily recovery is restored. Sending remains disabled pending controlled live delivery/signing acceptance. Production unchanged. See `guest-documents/deployment/signing-rollout/README.md`.

**Signing integration — 2026-09-26:** persistent private staging Documenso is healthy; its internal API identity/secret is commissioned. Candidate gateway/completion runtimes are packaged and queued completion passes real local signing, but separate signing credentials now pass actual ECS isolation checks. Live sending remains disabled pending secret recovery coverage, service deployment and migration013/recovery rollout. Production unchanged. See `portal/guest-documents/README.md`.

**Navigation update — 2026-09-26:** the user now explicitly wants Documents in the sidebar. Order: Overview, Projects, Calendar, People, Reports, Documents, Library, Settings. Overview retains its four summary cards and replaces the standalone Documents button/recent list with six section-preview tiles (no Settings tile). This supersedes earlier instructions to keep Documents out of the sidebar.

**Staging document review live — 2026-09-26:** scanner removed; migration010 and staff Documents screens deployed in the existing staging task. Six live access/UI checks and backup/restore pass; test accounts removed and daily recovery enabled. Production unchanged. Documenso handoff and sending remain next. See `portal/guest-documents/README.md`.


**Scope correction — 2026-09-26:** the user explicitly rejected the added scanner. Remove its implementation and deployment prerequisites; do not add scanner hosting or related charges. Continue Documenso integration on existing infrastructure. Earlier scanner plans below are superseded. See `portal/guest-documents/README.md`.

**Admin Library and upload-only contracts:** see [implementation and release requirements](deployment/file-library/README.md). Deployed and accepted on staging and production, with independent object restore verification. HTML opens in isolated modals; the separate Phase 3 guest-document candidate remains undeployed.

**Phase 3 in progress:** the [guest workflow foundation](guest-documents/README.md) adds pre-account recipients, immutable versions and approval/dispatch records in an isolated candidate schema. Public guest pages and deployment remain pending.

**Production update — 2026-09-25:** Phase 2 is now deployed at https://clients.growthcast.app with the staging setup migrated into a separate production environment. Staging remains independent. Existing account passwords are unchanged. See the [production release and operations record](deployment/production/README.md). Earlier staging-only and deferred-production statements below are historical; Phase 3 document work remains next.

**Phase 2 is accepted for the staging repository and deployment foundation (2026-09-25).** The branded portal runs on Vercel with a private ECS API and dedicated Supabase persistence. Pinned builds and CI, reviewed migrations, verified accounts, session/file persistence, independent backup restore, actual runtime-secret recovery, and managed staging signing checks pass.

Read the [acceptance report](docs/phase-2-acceptance.md), [closeout evidence](deployment/phase-2-closeout/acceptance.json), and [operations runbook](deployment/phase-2-closeout/OPERATIONS.md). The private deployment repository is [growthcast-client-portal](https://github.com/B2B-Saas-Inc/growthcast-client-portal). Phase 3 guest documents is next; production trust, capacity/recovery objectives and rollout remain later gates.

The public Astro/Forecast application remains independent, and its root Docker build excludes this directory. The compatibility harnesses below preserve the original local foundation; their historical limitations do not override current staging acceptance.

## Deliverables

- [Atrium compatibility harness](atrium-spike/README.md): real-database checks, full AppModule claims/ownership and optional desktop/mobile catalog browser verification, with [required integration contract](docs/atrium-integration.md).
- [Local signing gateway](gateway/README.md): implementation, repeatable container runner, observed signing/PDF evidence and outstanding checks.
- [Embedding findings](docs/embedding.md): verified official SDK behavior, current pricing context and remaining deployment limits.

- [Architecture and decisions](docs/architecture.md): system ownership, deployment boundaries, source/license findings, unresolved operator decisions.
- [Threat model and gateway revision](docs/security.md): the failed native-access gate and concrete requirements for the next spike.
- [Execution evidence](docs/execution.md): source provenance, reproducible findings, verification and outstanding work.
- [Deployment design](docs/deployment.md): service/secret inventory and migration, backup, rollback and release gates.
- [Upstream pins](upstream-lock.json): inspected revisions, independently rechecked against upstream on 2026-09-22. Production image digests are intentionally unset.

## Reproduce the compatibility test

With a clean local Documenso checkout at `389390c884949fe27c240488a3259da3cdba93e0`:

```sh
sh portal/spike/run.sh /absolute/path/to/documenso-checkout
```

The runner checks the commit and tracked worktree, builds a digest-pinned Node image using `npm ci`, and runs as a non-root user without network, writable root filesystem, or Linux capabilities. The upstream checkout is mounted read-only. Dependencies match the selected Documenso lockfile. No host packages, application secrets, PostgreSQL, provider calls, mail or real documents are involved.

The Node loader verifies SHA-256 hashes of the two upstream routes and their surrounding router/middleware. It executes the original TypeScript routes and the original PDF response helper with real Hono/Zod validation. Only database/storage/session and other infrastructure imports are replaced with deterministic synthetic fixtures. The fixture bytes are a PDF marker, not a signable legal PDF.

**A green run means the incompatibility was reproduced, not that the portal is secure.** Thirteen characterization tests show bearer-only PDF access (including HEAD/Range and initial version), long-lived private caching, and negative controls for incorrect bindings and anonymous account routes. They do not prove end-to-end signing, production exploitability, database policies, gateway behavior, certificate trust, browser compatibility, or provider integration.

## Next stage

The plan's Phase 1 gate says: “If not, stop and revise scope before building the full portal.” Native recipient tokens cannot be the public authorization boundary for the stated GrowthCast requirements. The [local gateway](gateway/README.md) has completed PIN-based native and official SDK signing, cross-client/organization denial, and test-certificate PDF verification. Its rejection/restart/revocation runner now passes. The combined `PORTAL_ATRIUM_CHECKOUT=/absolute/path/to/atrium-checkout sh portal/gateway/run.sh` mode connects canonical completion and independently verified sealed PDFs to Atrium account claims and desktop/mobile catalog opening. Resolve the remaining [gateway revision](docs/security.md#gateway-spike-revision) gates. Do not proceed to full portal development or per-client cutover until that spike passes. Hosting, licensing, account identity, retention and billing decisions remain explicit release prerequisites, not implied purchases or sends.


Latest status: [bounded Phase 1 acceptance review](docs/phase-1-acceptance.md). The local technical gate passes and licensing is resolved by operator confirmation. Production infrastructure and release work retain their later-phase gates.

Hosting is selected: Vercel at `clients.growthcast.app` with dedicated Supabase PostgreSQL; other backing services remain provisional. Read [deployment configuration](deployment/README.md) for the validated infrastructure foundation, proxy boundary tests and outstanding access/runtime gates. A protected Vercel staging project and dedicated Supabase staging project now exist; no portal application is deployed.

**Current database decision:** existing Supabase PostgreSQL replaces the RDS proposal. The unexecuted AWS change set was deleted; the $69.51 estimate is withdrawn. Staging private schemas and NOLOGIN roles now pass isolation checks. The separate managed Atrium baseline is applied and verified; original public-schema migration checksums are preserved. Documenso’s managed history is also applied and its restricted signing suite passes. Scoped runtime credentials, off-host operational recovery and application deployment remain open. Read [deployment review](deployment/README.md). Other supporting-service choices remain provisional.
