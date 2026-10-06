# Phase 1 acceptance review — 2026-09-23

**Engineering verdict: PASS for the pinned local compatibility/security spike. Overall Phase 1 disposition: CONDITIONAL, with two licensing decisions still open.** This is not production readiness, a legal entitlement determination, or permission to deploy/send client documents.

The authoritative gate is Phase 1 in the Desktop implementation plan: accountless signing works and anonymous direct-token/PDF bypass fails. Native Documenso bearer access fails that requirement; the scoped signing gateway meets it in the tested configuration. Production infrastructure is assigned to Phase 2 rather than added indefinitely to this spike.

## Configuration and decision

- Atrium: `1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2`.
- Documenso inspected source: `389390c884949fe27c240488a3259da3cdba93e0`, v2.18.0; tested ARM64 image: `sha256:615d0e79047ff9615dc86092bf9a6ba021750ee3895f440621e94477b581b183`.
- Official React embed SDK: 0.6.2. No paid claims, branding removals or license checks were bypassed.
- Synthetic PDFs/recipients; disposable databases and captured email; database-backed provider files; internal Docker networks without published provider ports. Chromium desktop/mobile; local test signing/TLS certificate.
- **Select the gateway architecture.** Native recipient tokens are not the GrowthCast authorization boundary. All provider data, signing, SDK and PDF requests pass through durable grant/session checks. Provider ingress stays private; handoffs are one-use and recipient/envelope/version bound, with host-only signing cookies.

Image/source equivalence has not been established through a reproducible source build. This review records both pins rather than claiming provenance that was not proved.

## Acceptance evidence

| Requirement | Disposition and evidence |
| --- | --- |
| Isolated synthetic environment | Pass; disposable containers, databases, mail sink and test certificate, with no production sends or host provider ports. |
| Atrium implementation characterized | Pass; original 11 auth/document/payment cases plus 28 integration cases. Native invoice semantics and unverified signup behavior are documented findings, not adopted production behavior. |
| No-signup PIN signing | Pass; API-created envelopes, salted Argon2id PINs and one-use handoffs; provider database confirms no signer accounts were created. |
| Recipient/client/organization scope | Pass; two recipients, two clients in one organization and a second organization; mixed-recipient and substituted-ID requests rejected. |
| Native and SDK flow | Pass; sequential and parallel countersigning, rejection, official SDK callbacks, separate same-site origins and wrong-origin/frame denial. |
| Final PDF verification | Pass; all four terminal artifacts verified with OpenSSL against the disposable certificate, with final ByteRange covering the final revision. This does not establish public/legal signing identity. |
| Copied-token/direct-origin bypass | Pass; anonymous captured requests and direct completed-PDF URLs denied; browser edge cannot reach the private provider service. This configuration has no external object-storage URL. |
| Replay, expiry and revocation | Pass; 32 PostgreSQL/HTTP/PIN/policy cases, including handoff expiry, generation changes, atomic consumption, CSRF and outages; full captured-request replay also denied with expired sessions and revoked grants. |
| Restart persistence | Pass; existing sessions and current sealed PDFs remain accessible after gateway restart. |
| Alternate route inventory | Pass; 588 denial probes: 504 GET/HEAD requests with Range headers across 18 alternate-route/substituted-ID forms and anonymous/valid-session contexts, plus 84 current sealed-PDF cross-recipient GET/HEAD/Range probes across seven saved sessions. |
| Real catalog handoff | Pass; 39 Atrium cases and desktop/mobile login → catalog → signing gateway → hash-matched sealed PDF. Restricted worker, SCRAM isolation and signed verification receipts exceed the original spike gate. |
| License/edition decision and price | Open; see the two concrete decisions below. |

The final gateway run denied 45 anonymous, 270 wrong-recipient, 45 expired-session and 45 revoked-session captured-request replays. The combined Atrium/browser run also passed all 39 cases and current sealed-PDF hash checks. The 13 source-pinned characterization cases still reproduce why native bearer access cannot be used directly.

The expiry drill snapshots original fixture session expiry timestamps, expires sessions while grants stay valid, and then restores exactly those timestamps. It never extends a session lifetime. A second positive-access check proves revocation tests are not accidentally passing merely because the sessions remained expired.

### Route review boundary

The expanded matrix covers legacy token file/download routes, QR-token-shaped routes, account/presigned file variants, provider envelope/audit API routes, certificate-status and internal audit/certificate render routes, direct-template/multisign/authoring embeds, unapproved sign data loaders, unapproved document tRPC and substituted envelope/item/data IDs. It probes both anonymous requests and valid sessions. Native sign/completion and exact current PDF positive controls remain accessible to the correct session.

Source review confirms provider assets and manifests pass through authorization before the allowlist; the public gateway entry/PIN JS and CSS are fixed strings without document metadata. Unknown routes and methods fail closed. The permitted recipient embed data and manifest dependencies are narrow and exercised by the SDK. Mutation origin/CSRF and mixed-batch behavior are covered by the existing HTTP/policy tests.

This is a bounded review of the pinned spike, not an exhaustive vulnerability assessment of every upstream application route, browser engine or future storage driver. New provider routes, upgrades or storage transports require fresh review.

## Audit-log finding

The audit download is an API-key/team-authorized, generated PDF. At the pinned source, `apps/remix/server/api/download/download.ts` calls `generateAuditLogPdf` and saves it; `packages/lib/server-only/pdf/generate-audit-log-pdf.ts` renders database audit events and merges pages without a signing operation. The live runner now saves each generated audit export inside the disposable volume, checks its PDF header and confirms absence of a PDF signature ByteRange.

**The sealed contract is cryptographically verified; the separate audit-log export is not independently signed or attested.** A hash or our receipt for the contract does not authenticate historical audit events. The earlier gateway-revision wording requested cryptographic verification of both; that stronger audit-record assertion is not satisfied and must not be reported as a pass. It is outside the original Phase 1 gate. Decide audit retention/attestation requirements during signing implementation and release acceptance (Phases 4/7).

## Remaining licensing decisions

1. **Atrium agency-client hosting.** The pinned [Atrium ELv2 license](https://github.com/Vibra-Labs/Atrium/blob/1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2/LICENSE) restricts hosted/managed offerings exposing substantial functionality. Elastic's [official FAQ](https://www.elastic.co/licensing/elastic-license/faq) distinguishes limited application use from substantial access; it does not determine Atrium's permission for this particular client portal. Record an applicable determination or permission for GrowthCast's client-facing documents/accounts/invoices/project UI. No licensor correspondence or approval has occurred.
2. **Documenso edition, branding and price.** [Self-hosting documentation](https://docs.documenso.com/docs/self-hosting) describes core AGPL functionality and enterprise feature keys. The pinned [commercial license](https://github.com/documenso/documenso/blob/389390c884949fe27c240488a3259da3cdba93e0/packages/ee/LICENSE) distinguishes testing from production use of covered enterprise code. Confirm which edition covers the intended self-hosted SDK/branding/certificate arrangement and its actual fee. The local tests preserve existing branding and claims; working code alone is not proof of production entitlement. Record AGPL corresponding-source/notice obligations where applicable.

Current official pages rechecked on 2026-09-23:

| Published offering | Price shown | Applicability |
| --- | --- | --- |
| Hosted Teams, embedded signing | $40/month billed annually ($480/year) | Hosted service price only. |
| Hosted Platform, white-label embedded signing | $250/month billed annually ($3,000/year) | Hosted service price only. |
| Self-hosted Community | Free tier; no enterprise feature set | Marketing positions it for testing/evaluation/internal POCs; this is not itself a legal interpretation of the AGPL license. |
| Self-hosted Business / Enterprise | Yearly license / tailored price; no numeric quote published | Exact GrowthCast production entitlement and cost remain unknown. |

Sources: [hosted pricing](https://documenso.com/pricing), [self-hosted edition matrix](https://documenso.com/self-hosted). The self-hosting documentation and marketing positioning do not resolve the exact intended production arrangement. No quote was requested, purchase made or message sent.

A concrete unsent clarification brief is: GrowthCast will operate an agency-client portal, retain upstream notices, offer accountless recipient signing through a private-provider/session gateway, and use the official React SDK. Confirm permission for the client-facing feature set, ordinary versus white-label embedded signing, required edition/hosts and annual license/certificate cost. This report does not infer authorization to send that brief.

## Handoff to later phases

- Phase 2: non-owner application roles, managed secrets and trust-key rotation, database TLS, reproducible builds, reviewed migrations, persistence/restore, production ingress and egress.
- Phases 3/3A/3B: actual guest/client routing, internal search, staff approval and private HTML/PDF proposal workflow.
- Phase 4: production lifecycle/claim integration, invitations and audit evidence policy.
- Phases 5/6/6A/7: Attio, canonical Stripe invoices, proposal migration and release/pilot acceptance.

Those items do not retroactively expand the bounded Phase 1 technical gate. Resolve the two commercial decisions to close Phase 1 overall; production deployment remains separately gated.

## Reproduction

```sh
sh portal/spike/run.sh /absolute/path/to/pinned-documenso-checkout
PORTAL_ATRIUM_CHECKOUT=/absolute/path/to/pinned-atrium-checkout sh portal/gateway/run.sh
docker build -t growth-model .
```

No host packages are installed. Fixtures, credentials, PDFs and raw bearer-route captures remain in disposable volumes. Only named synthetic screenshots and redacted route inventory leave the containers, in ignored artifact directories. Official-page extracts are saved in ignored `.firecrawl/phase1-*.md`; durable claims link directly to primary sources above.


## Bounded Phase 1 acceptance — 2026-09-23

The [acceptance review](phase-1-acceptance.md) is the current status reference. Engineering verdict: PASS for the pinned local spike; overall Phase 1 remains CONDITIONAL on Atrium agency-client hosting applicability/permission and the intended Documenso self-hosted edition/entitlement/price. No production authorization is implied.

Added 588 alternate-route/substituted-ID/current-sealed cross-recipient denial probes and full expired-session replay. The final gateway runner denied 45 anonymous, 270 wrong-recipient, 45 expired and 45 revoked captured requests, with positive access restored between expiry and revocation without extending original lifetimes. The combined run passed 39 Atrium cases and browser PDF access; the gateway suite passed 32 cases; the native-boundary characterization still passes 13 cases by reproducing the native incompatibility.

Source review and live audit PDF inspection establish that separate audit exports are generated and unsigned. Sealed PDFs are cryptographically verified; no independent audit-event attestation is claimed. This limitation from the expanded spike wording is recorded explicitly and handed to Phases 4/7 policy/implementation. Production key management, TLS, application database roles, migrations/restore and ingress belong to Phase 2 rather than expanding the original Phase 1 technical gate.

Official licensing/pricing pages were rechecked with Firecrawl. No self-hosted numeric Business/Enterprise quote was published on the inspected page; hosted Teams/Platform prices are not self-hosted entitlements. No vendor message, license purchase or deployment was performed.

Acceptance-review verification also passed the required public-site Docker build (196 tests; zero Astro errors/warnings) and portal lint. All review stacks cleaned up and both research checkouts remained unchanged.

## Phase 2 local foundation — 2026-09-23

Implemented [the local foundation](../foundation/README.md) without deploying services. Ignored local Atrium and Documenso branches preserve the pinned commits, upstream remotes and license notices. A digest-pinned build regenerates the Atrium schema baseline and compares it with the frozen migration manifest; explicit transactional migrations replace schema push in this new harness. Application, migration, lifecycle and administrator credentials are separate, with verified database TLS and read-only runtime schema validation.

The final container run passed all three manifest/release-validator tests and the database integration sequence: unmigrated startup rejection, repeat migration no-op, runtime privilege denials, plaintext/untrusted-CA/wrong-hostname and cross-role login rejection, restart persistence, drift/checksum tampering rejection, and isolated database/artifact restore with matching ownership/length/hash and preserved runtime restrictions. A second restore was rejected before overwriting the populated target; the target still verified afterward. All disposable resources were cleaned up. Portal lint passes with ignored upstream checkouts excluded from this repository's lint rules.

The staging/production Compose files deliberately execute only preflight validation; the checked-in release manifest is blocked. Manual-only CI reproduces the local foundation without deployment credentials. Full application images/startup integration, ingress/egress, captured staging mail, managed secret/certificate rotation and real provider recovery remain outstanding. The test uses quiescent synthetic data and disposable plaintext backup volumes; it establishes neither production backup protection nor RPO/RTO. Commercial decisions remain open. No remote fork, push, vendor message, purchase, deployment or proposal cutover occurred.

Local evidence: `/tmp/growthcast-phase2-foundation-final.log`, `/tmp/growthcast-phase2-lint.log` and `/tmp/growthcast-phase2-checkouts.log`. These logs are not committed.

Required public-site verification also passed: `docker build -t growth-model .` completed lint, all 196 tests, Astro checks (zero errors/warnings) and production build. Evidence: `/tmp/growthcast-phase2-root.log`. No public UI behavior changed.

## Phase 2 application identity integration and operator licensing decision — 2026-09-23

The operator confirmed that self-hosted licensing is handled with no licensing issues. [The recorded decision](licensing-decision.md) supersedes earlier commercial blockers; Phase 1 is accepted. Both release-manifest licensing references are populated. Infrastructure inputs and release approval remain unset, so the preflight still fails closed without treating licensing as unresolved.

Added a source-pinned foundation application image that compiles the full Atrium API and runs its AppModule with the actual PrismaService under `gc_app`. The entry wrapper checks migration hashes/schema before launching the child, loads only the runtime credential, and configures Prisma for strict certificate verification. The application integration passes invited signup, captured verification email, verification callback and authenticated session retrieval; uninvited signup, schema creation and direct sealed-artifact writes are denied. PostgreSQL confirms the actual Prisma connection uses TLS and `gc_app`. Storage/Stripe/mail use local test implementations, not live services; the container is confined to the internal Docker network. The test has a bounded deadline.

Restart and isolated restore checks now include the verified user and persisted session produced by those HTTP routes. This does not yet move the older catalog/signing fixture off its owner identity or constitute a complete staging deployment. Scoped sealed-artifact handoff, production service images/entrypoints, captured SMTP configuration, ingress/egress and production secret/certificate recovery remain work for Phase 2.

Verification passed: the complete foundation runner (three manifest/preflight tests, restricted AppModule HTTP integration, TLS/permission/drift checks, restart and restore), portal lint, and the required public Docker build (196 tests; zero Astro errors/warnings). Evidence: `/tmp/growthcast-phase2-app-final.log`, `/tmp/growthcast-phase2-app-lint.log`, `/tmp/growthcast-phase2-app-root.log`. Both pinned checkouts remain clean and disposable test containers were removed. Nothing was deployed.

## Phase 2 restricted catalog and artifact handoff — 2026-09-23

Added migration `004-account-handoff.sql` without changing the first three migration checksums. The shared claim/catalog path now copies canonical sealed references through `copy_account_artifacts`, after inserting account context in the same transaction. The function has a fixed search path, explicit schema references, no PUBLIC execute permission and an application-only grant. It rechecks current verified identity/session, recipient, organization/project membership, source-bound project/document version/file, source generation/expiry/revocation and matching child binding/expiry. Callers cannot supply artifact IDs or hashes, and direct application artifact writes remain denied.

The foundation runs actual AppModule auth plus a fixture catalog controller using shared catalog code under `gc_app` over verified TLS. Authenticated HTTP list/open and anonymous denial pass; normal organization selection uses the native auth endpoint to invalidate session cache. Tests cover one-use claim/handoff replay, wrong account/session, direct function misuse, forbidden lifecycle-role execution, project membership removal and source revocation. Gateway-store redemption resolves the canonical final data ID. Restart/restore checks include all three canonical/copied artifact references with matching hashes, alongside the HTTP-created verified account/session and document/file rows.

This foundation test uses synthetic completion data seeded in a separate migration-credential fixture job. It does not claim a production lifecycle writer or real signing in that restricted-role stack. The existing live Documenso/browser runner remains a separate regression with its older application identity. Completing that unified runtime stack and staging deployment remains Phase 2 work. Licensing stays resolved; nothing was deployed.

Verification: final frozen migration/function passes the complete foundation run (`/tmp/growthcast-phase2-catalog-locked.log`) and all 39 Atrium cases (`/tmp/growthcast-phase2-catalog-locked-regression.log`). The combined real-provider/browser run also passed 32 gateway cases, native/SDK signing, canonical PDF verification, desktop/mobile catalog access, restart and revocation (`/tmp/growthcast-phase2-catalog-combined.log`); the final added source-project/version predicates were subsequently covered by the frozen-function foundation and Atrium runs. Portal lint and the required public Docker build pass (196 tests; zero Astro errors/warnings), with logs `/tmp/growthcast-phase2-catalog-lint.log` and `/tmp/growthcast-phase2-catalog-root.log`. Disposable test stacks were removed; generated screenshots remain ignored.

## Phase 2 real-provider gateway identity — 2026-09-23

Moved the combined Atrium HTTP/HTTPS gateway to a dedicated `gc_gateway` database role with its own random SCRAM credential. The gateway container no longer mounts owner credentials and has no lifecycle credential mount. Provisioning remains in the isolated test initializer; gateway startup performs bounded readiness checks, asserts its database identity/credential boundary and tests forbidden operations before opening listeners, without DDL.

The role reads authorization state, inserts sessions and updates only handoff consumption. PostgreSQL row locking requires a column UPDATE grant, so `UPDATE(binding)` permits redemption's lock while the immutable-binding trigger rejects actual binding changes. No expiry/generation/revocation writes, grant deletion, canonical writes, account-copy function execution or owner-role assumption are permitted. An added regression tests both valid row locking and all those denials against existing grants.

This closes the owner-credential gap for the gateway on the real-provider/browser path. The Atrium application/seeding fixture still uses owner credentials; the older combined database still requires consolidation with foundation TLS and reviewed migrations. These limitations remain Phase 2 work rather than being hidden by the separate restricted AppModule tests. Licensing remains resolved. No deployment or client cutover occurred.

Focused verification passed all 40 Atrium cases (11 characterization plus 29 integration), including the new gateway-role checks. The combined browser run verified desktop/mobile login and catalog, real sealed-PDF hashes, anonymous/cross-client denial and HTTPS cookie isolation through the dedicated-role gateway. Portal lint and the public Docker build also pass (196 tests; zero Astro errors/warnings). Logs: `/tmp/growthcast-phase2-gateway-role-focused.log`, `/tmp/growthcast-phase2-gateway-role.log`, `/tmp/growthcast-phase2-gateway-role-lint.log`, `/tmp/growthcast-phase2-gateway-role-root.log`.

The combined runner completed successfully, including all 32 gateway cases, native/SDK signing, restart, boundary probes, expired-session denial and revocation replay. Its disposable stacks were removed. Both pinned source checkouts remain unchanged; screenshots and raw runtime evidence remain ignored.

## Phase 2 shared migrations, TLS and restricted HTTP components — 2026-09-23

The combined Atrium runner now uses the foundation's reviewed migration manifest. A separate initialization job creates generated SCRAM identities and applies migrations as `gc_migrate`; application startup no longer runs the removed inline schema initializer. Migration 005 adds the dedicated gateway grants and read-only schema metadata access for gateway/lifecycle roles without modifying the first four migrations. The pinned source build compares its generated schema with the reviewed baseline. Startup checks schema state before launching runtime children; the HTTP application also checks it using its restricted store.

PostgreSQL rejects plaintext host connections. Prisma uses strict CA verification; gateway/lifecycle stores receive an explicit trusted CA and verify the hostname. Database private keys are absent from runtime mounts. Certificate/credential setup now preserves existing material when Compose starts additional services. Focused tests confirm TLS on the actual Prisma/store connections and reject plaintext/untrusted-CA connections.

Auth, native HTTP services, catalog, claims and ownership guards now receive `gc_app` clients. The test driver retains distinct owner clients solely for fixture construction and intentional failure injection; those clients are not injected into HTTP components. The driver still shares their test process, so production process/credential isolation remains outstanding. Separate gateway/lifecycle containers retain their restricted identities and no owner credentials. No production deployment or client cutover occurred; licensing stays resolved.

The foundation runner also passes with migration 005, including restart persistence, role restrictions, drift checks and isolated database/artifact restore. Evidence: `/tmp/growthcast-phase2-unified-foundation.log`.

Verification passed: the combined runner's 42 Atrium cases (11 characterization plus 31 integration), real-provider desktop/mobile catalog access and sealed-PDF hash checks; all 32 gateway cases and native/SDK signing; the foundation restart/restore suite; portal lint; and the required public Docker build with 196 tests and zero Astro errors/warnings. Evidence: `/tmp/growthcast-phase2-unified-combined.log`, `/tmp/growthcast-phase2-unified-foundation.log`, `/tmp/growthcast-phase2-unified-lint.log`, `/tmp/growthcast-phase2-unified-root.log`. Both pinned research checkouts remain unchanged.

## Phase 2 isolated HTTP API — 2026-09-23

Extracted the shared HTTP component graph into `api-runtime.mjs` and moved the listener into `api-server.mjs` in a separate container. The privileged driver no longer starts a listener; its HTTP requests, Next.js and the browser edge target `api:3001`. Direct-service negative controls use the same shared component graph without starting a server.

The API mounts only its restricted application credential, public database CA and disposable evidence volume. Its root filesystem is read-only, capabilities are dropped and no-new-privileges is enabled. Startup rejects owner/migration/worker/gateway/provider/private-database-key/browser-runtime mounts, verifies the `gc_app` TLS connection, and checks forbidden DDL/canonical writes and role escalation. Schema guards remain active. The driver retains privileged fixture clients in its separate container, never in the API process.

Captured test verification mail and side-effect counters are written atomically by the API. The driver mounts that evidence read-only and explicitly verifies that an attempted write is rejected. Side-effect assertions combine HTTP-process counters with direct-service controls, preserving the existing no-storage/no-payment-side-effect tests. No test-control HTTP endpoint was added.

This closes the local API/test-driver process and credential boundary. Synthetic mail/storage/payment adapters and the test auth secret are still explicit; production service adapters, managed secrets, staging configuration and operational recovery remain Phase 2 work. Licensing remains resolved; nothing was deployed.

Verification: all 42 Atrium cases pass (11 characterization and 31 integration) in the focused final run, including the read-only evidence check. The combined run also passes desktop/mobile login/catalog/handoff and real sealed-PDF hash matching through the separate API, plus all 32 gateway cases. Portal lint and the public Docker build pass, including 196 tests and zero Astro errors/warnings. Evidence: `/tmp/growthcast-phase2-isolated-api-final.log`, `/tmp/growthcast-phase2-isolated-api-combined.log`, `/tmp/growthcast-phase2-isolated-api-lint.log`, `/tmp/growthcast-phase2-isolated-api-root.log`. Both pinned checkouts remain clean; generated screenshots stay ignored.

The combined runner completed its restart, expired-session and revocation replays successfully and removed its disposable stacks. No deployment or client communication occurred.

## Phase 2 — encrypted provider recovery and captured SMTP (2026-09-23)

The new `portal/recovery/` overlay runs inside the disposable real-provider gateway harness. It quiesces writers, dumps Documenso and gateway databases, archives allowlisted signed artifacts and public verification evidence, then encrypts the bundle with AES-256-GCM using a separately mounted random key. Restore rejects wrong keys and tampered ciphertext before writing plaintext, validates checksums and refuses a populated target. The separate restored database passes OpenSSL verification for all four signed PDFs, byte/hash comparisons with the provider records, team/status/canonical-reference checks, recipient grant binding checks and existing-session checks. A second verification confirms the overwrite refusal preserves the restored data. The initial measured fixture snapshot/restore/verification took four seconds; this is not a production RTO. Keys and all plaintext/ciphertext volumes are removed at harness exit. Off-host retention, managed key recovery and actual operational restart remain open.

The combined Atrium API now consumes a random auth secret from a dedicated read-only mount instead of a fixed fallback. Missing or malformed values fail startup. Verification mail travels through Nodemailer to the pinned internal SMTP capture service. Recipients are limited to single synthetic addresses, there is no relay configured, and mail has no published ports or external network. The integration test reads actual captured messages; native invited signup and verification still pass. Manual CI now includes the isolated API/SMTP suite as well as foundation migration/recovery checks. The foundation's separate synthetic auth harness is unchanged.

The combined browser run passes 43 Atrium cases (11 characterization, 32 integration), 32 gateway cases, and desktop/mobile login/catalog/handoff to actual sealed PDFs. The recovery checks pass. Evidence is in `/tmp/growthcast-phase2-closeout-final.log`; focused SMTP verification is in `/tmp/growthcast-phase2-closeout-mail-final.log`. Portal lint passes and the public Docker build succeeds using its unchanged cached verification layers. Both pinned source checkouts remain clean. See `phase-2-acceptance.md` for the exact remaining deployment work; Phase 2 is not marked accepted and no deployment or purchase occurred.

## Phase 2 — selected Vercel/AWS target (2026-09-23)

The operator selected Vercel and `clients.growthcast.app` and delegated the remaining provider choices. Selected a Vercel frontend with AWS Fargate private backend/provider/worker, RDS PostgreSQL, S3/KMS backups, Secrets Manager, ECR and ACM in us-east-1. Current Vercel documentation now supports OCI containers, but reports no Secure Compute/static IP support for them and idle scale-down; the hybrid choice preserves the existing private provider and durable worker topology.

Added `portal/deployment/targets.json`, a CloudFormation foundation with private networking/storage/secrets and no application tasks/public provider ingress, Vercel config/environment templates, and API origin proxy/guard helpers with six isolation/security tests. These helpers are not wired into the production application yet. Outbound HTTPS security-group rules are not a destination allowlist. Manual CI now validates the infrastructure schema and boundary tests. The connected Vercel app returned no accessible teams, and no AWS connector is available. No deployment, DNS mutation, purchase or secret disclosure occurred. Production packaging, account access, signing identity and deployed recovery remain open; see `portal/deployment/README.md`.

Verification for this increment: `sh portal/deployment/check.sh` passes CloudFormation lint and all six Node tests; portal ESLint passes; `docker build -t growth-model .` passes 196 tests and reports zero Astro errors/warnings. Logs: `/tmp/growthcast-deployment-final.log`, `/tmp/growthcast-vercel-portal-lint.log`, `/tmp/growthcast-vercel-root-build.log`. A container-only, read-only AWS STS identity check using the existing local profile ultimately returned `LoginRefreshRequired`; no credential values were printed and no cloud mutations were attempted. Refresh AWS login and expose the intended Vercel team to enable deployment work.

## Phase 2 — access restored and staging foundation prepared (2026-09-23)

AWS STS succeeds for account 059393269249. The Vercel connector still returns no teams, but the refreshed local Vercel login works through its REST API; the b2b-saas team owns growthcast.app. Created the separate growthcast-clients-staging project with authentication protection on all deployments. No DNS or public agency project changes occurred. AWS validated the foundation template and PostgreSQL 17.11 availability. Prepared, but did not execute, phase2-foundation-v1: CREATE_COMPLETE/AVAILABLE, 80 additions only. Price List API evidence produces an estimated $69.51/month fixed foundation cost plus usage, excluding application runtime and production. Exact change-set/template hash, project IDs, cost assumptions and remaining work are in portal/deployment/staging-review.md and adjacent JSON files. Original plan section 4 explicitly withholds spending authorization for its allowance; the concrete foundation is ready for that decision. No billable AWS infrastructure or application deployment was started.

## Phase 2 — Supabase correction and AWS withdrawal (2026-09-23)

The operator identified existing Supabase as the database platform. Updated the selection to Supabase, archived the RDS template, and deleted the exact unexecuted CloudFormation change set after checking the AWS account, AVAILABLE execution status and REVIEW_IN_PROGRESS stack status. No provisioned resources were removed; no billable foundation was created. The old $69.51 quote is withdrawn. All other AWS choices are provisional pending existing-service inventory.

Added a containerized read-only Supabase catalog preflight and four connection-boundary tests. It verifies project matching and TLS, excludes transaction pooling and rejects URL overrides; reports schema occupancy, database major, role privileges and API/PUBLIC default ACLs without printing connection details. Existing migration 003 grants across all public tables and the schema fingerprint covers all public objects, so a shared project must be inspected/adapted first. No Supabase connector/login or database environment names were found for the GrowthCast Vercel project; the project name/URL has been requested. No live Supabase inspection, migration or compatibility pass is claimed.

Verification: all 11 deployment/proxy/Supabase connection tests pass; the read-only preflight image builds; portal ESLint passes; the public Docker build passes 196 tests with zero Astro errors/warnings. Logs: `/tmp/growthcast-supabase-check.log`, `/tmp/growthcast-supabase-build.log`, `/tmp/growthcast-supabase-lint.log`, `/tmp/growthcast-supabase-root.log`. Live Supabase compatibility remains unverified pending project identification and access.

## Phase 2 — dedicated Supabase project requested

The operator clarified that a new project must be created within B2B SaaS Inc. Recorded `growthcast-clients-staging` in us-east-1 as the prepared isolated staging target; no project reference or successful provisioning is claimed. Discovery found no shared Tidebreak browser tabs or Chrome connection. Opening the Supabase dashboard returned “browser origin is not shared with this agent.” Do not try another browser path to bypass that access boundary. Share authorized Supabase dashboard access, then inspect the organization/project cost and proceed with project creation and database preflight. No resources, credentials or existing Supabase databases were changed.
