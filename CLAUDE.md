# CLAUDE.md

**Production documents live — 2026-09-26:** the completed staging document workflow is now deployed to `https://clients.growthcast.app`: Documents navigation, field/tag preparation, optional-PIN signing, GrowthCast branding/favicon, verified downloads, executed-PDF emails and seven-day link validity. Production keeps its own data, credentials and services; existing accounts/password hashes are unchanged. Ten production browser checks, runtime/access checks and independent data/secret recovery pass. Thirty-minute recovery is restored. See `portal/guest-documents/deployment/production/README.md`.

**Staging signing-link expiry — 2026-09-26:** new signing links follow the approved expiry, up to seven days, while browser sessions remain one hour. Existing links are unchanged. Both PIN modes, expiry/revocation and the full local signing/PDF/email flow pass. See `portal/guest-documents/deployment/expiry-rollout/README.md`. Production unchanged.

**Staging download and favicon fix — 2026-09-26:** native Original/Signed download buttons now resolve through the exact approved/verified PDF versions; browser checks click both buttons and compare file hashes. Signing and confirmation icons now use the existing GrowthCast portal favicon. See `portal/guest-documents/deployment/download-rollout/README.md`. Production unchanged.

**Staging completion email — 2026-09-26:** confirmation screens hide Share and retain Download. The existing delivery worker now sends the verified executed PDF through Workspace SMTP once per completed document. Missing operator test copies were accepted by SMTP. See `portal/guest-documents/deployment/confirmation-rollout/README.md`. Production unchanged.

**Staging recipient signing live — 2026-09-26:** asset-loading failures are fixed; PIN and signing screens use GrowthCast branding. Staff approvals now offer optional PIN, with one email for link-only access or a separate code email when enabled. Both live signing modes, verified project PDFs and protected downloads pass; independent recovery passes and production is unchanged. See `portal/guest-documents/deployment/recipient-rollout/README.md`.

**Staging signing commissioning — 2026-09-26:** migration013, integration-secret recovery, private provider authorization, separate gateway/lifecycle services, seven HTTPS access checks and ten staff/client browser checks pass. Schema13 backup/restore passes and daily recovery is restored. Live sending remains disabled pending controlled live send/sign/attachment acceptance; production is unchanged. See `portal/guest-documents/deployment/signing-rollout/README.md`.

**Signing integration — 2026-09-26:** persistent private staging Documenso is healthy; its internal API identity/secret is commissioned. Candidate gateway/completion runtimes are packaged and queued completion passes real local signing, but separate signing credentials now pass actual ECS isolation checks. Live sending remains disabled pending secret recovery coverage, service deployment and migration013/recovery rollout. Production unchanged. See `portal/guest-documents/README.md`.

**Navigation update — 2026-09-26:** the user now explicitly wants Documents in the sidebar. Order: Overview, Projects, Calendar, People, Reports, Documents, Library, Settings. Overview retains its four summary cards and replaces the standalone Documents button/recent list with six section-preview tiles (no Settings tile). This supersedes earlier instructions to keep Documents out of the sidebar.

**Staging document review live — 2026-09-26:** scanner removed; migration010 and staff Documents screens deployed in the existing staging task. Six live access/UI checks and backup/restore pass; test accounts removed and daily recovery enabled. Production unchanged. Documenso handoff and sending remain next. See `portal/guest-documents/README.md`.


**Scope correction — 2026-09-26:** the user explicitly rejected the added scanner. Remove its implementation and deployment prerequisites; do not add scanner hosting or related charges. Continue Documenso integration on existing infrastructure. Earlier scanner plans below are superseded. See `portal/guest-documents/README.md`.

**Staging runtime package — 2026-09-26:** AWS login restored; live staging healthy and unchanged. Candidate Node image, private configuration denials, migration010/idempotency/drift and restricted TLS/schema guards pass locally. Scanner hosting/isolation and coordinated runtime/recovery rollout remain before deployment.

**Staging preparation — 2026-09-26:** limited staff ingress passes direct and HTTPS browser tests; official ClamAV publication rejects stale/tampered feeds and full-feed scans pass at 2 GiB/two CPUs. Previous full CI passed. Staging deployment is still pending runtime/migration/hosting work, and AWS CLI login expired. Production unchanged.

**Phase 3 email review — 2026-09-26:** candidate approval now binds stored branded document/code templates, sender and PIN policy. The frontend build and 65 backend/scanner checks pass. Link/code remain explicit placeholders; no mail transport is enabled. Staging release with sending disabled is the next milestone, after runtime/scanner/migration checks.

**Phase 3 recipient approval — 2026-09-26:** candidate PDF review now supports client-scoped recipient selection and explicit version approval without sending. Frontend build and twelve HTTPS browser checks pass, including exact persisted approval and zero dispatches. Branded send approval, delivery, operational scanning and deployment remain pending.

**Phase 3 PDF screens — 2026-09-26:** staff can upload immutable PDF versions and review stored PDFs in a modal through the actual local scanner. Ten HTTPS browser checks and 60 backend/scanner checks pass. Prior worker CI passed. Approval/send UI, operational threat feed, live integration and deployment remain pending.

**Phase 3 isolated scanner — 2026-09-26:** authenticated Unix-socket scanner, bounded process execution and scanner-to-database upload registration pass ten worker checks and 58 combined workflow checks. The previous ingestion CI passed. Current production threat feeds, live runtime/browser integration and deployment remain pending. See `portal/guest-documents/README.md`.

**File Library release — 2026-09-25:** deployed and verified on separate staging and production. Upload-only contracts use Uploaded without sending; admin Library originals can be copied into projects; HTML opens in sandboxed modals. The sidebar is Overview, Projects, Calendar, People, Reports, Library, Settings. Admin/client login, live feature checks, and independent backups/restores pass in both environments; synthetic fixtures are removed and normal schedules restored. See `portal/deployment/file-library/README.md`. The separate Phase 3 guest-document candidate remains undeployed.


**Phase 3 work started — 2026-09-25:** `portal/guest-documents/` contains a local candidate schema and transactional pre-account recipient/version/approval workflow. Fifty-five restricted-role database and guest HTTP checks pass on the current nine-migration baseline. Staff catalog cursor pagination includes all clients, recipients, projects and documents while rechecking access on every page. Real Better Auth and private Storage adapters, guarded staff APIs, and ten combined connector checks are implemented and verified. The candidate is outside the deployed migration manifest; initial staff catalog/client/recipient/draft screens now have a separate candidate overlay. Validated PDF ingestion and immutable registration now pass 14 focused database/HTTP checks; ten isolated real qpdf/ClamAV checks use controlled synthetic signatures. The production scanner worker/feed, upload/preview/approval screens, Node packaging, guest browser integration and deployment remain pending. See its README and the draft `phase-3-guest-workflow` branch in the private portal repository. Production and staging remain separate and unchanged.

**Production update — 2026-09-25:** Phase 2 is now deployed at https://clients.growthcast.app with the staging setup migrated into a separate production environment. Staging remains independent. Existing account passwords are unchanged. See the [production release and operations record](portal/deployment/production/README.md). Earlier staging-only and deferred-production statements below are historical; Phase 3 document work remains next.

**Current portal status — 2026-09-25: Phase 2 accepted for staging.** Private repository and CI, deployed persistence, backup/restore, actual staging secret recovery and managed test signing are verified. See [current acceptance](portal/docs/phase-2-acceptance.md). Phase 3 guest documents is next; production trust/capacity/recovery objectives and rollout remain later gates. Earlier progress notes below are historical.

**2026-09-25 — Project settings and email branding are deployed on staging.** Dates, duplicate, archive/unarchive and owner-only deletion are behind the project settings gear; the legacy sidebar rate editor is removed. All 14 automated email templates plus the configuration-test email use GrowthCast typography/colors, with email-client font fallbacks. Thirty-five focused tests and live desktop/mobile action/date checks pass; disposable fixtures are cleaned up. “Not Started” remains the stored project status, independent of dates. See [implementation and evidence](portal/deployment/project-polish/README.md).

**2026-09-25 — Monthly retainer and resource planning is deployed and accepted on staging.** Projects now have an internal Budget & team tab; Reports → Capacity shows member allocations, available capacity and logged utilization. Internal cost rates drive expected/actual cost and gross-margin calculations. The requested $4,000 / $218 / $109 / 15-hour example passes live browser acceptance; client read/write denials, desktop/mobile layout, save/reload, multi-project totals and scoped cleanup pass. The seventh additive migration and updated real backup-to-restore workflow pass. Recurring plans/current project cost rates are used for historical comparisons (no historical rate snapshots). See [implementation and acceptance](portal/deployment/resource-planning/README.md). Document-phase work remains pending.

Client portal work lives under `portal/`, independently of the Astro/Forecast application. Read `portal/README.md` before continuing it. The initial source-pinned container spike reproduces a Documenso bearer-PDF boundary mismatch; Phase 1 technical acceptance is recorded in `portal/docs/phase-1-acceptance.md`; self-hosted licensing is resolved by operator confirmation and the full portal is not implemented. The local gateway under `portal/gateway/` has a passing local PIN and signing suite, including the official SDK and organization isolation; resolve Atrium integration and deployment gates before building later phases. The Atrium harness under `portal/atrium-spike/` characterizes unverified signup sessions, reusable native tokens and native Checkout payment handling; its focused HTTP follow-up tests verified claims, durable gateway account checks and provider-ownership denials through compiled document/file/invoice/payment controllers. The runner now loads full AppModule and optionally verifies an actual Next.js Documents catalog and HTTPS handoff on desktop/mobile (`PORTAL_BROWSER=1`); the default destination remains synthetic. The combined `PORTAL_ATRIUM_CHECKOUT=/absolute/path/to/atrium-checkout sh portal/gateway/run.sh` mode now connects real local Documenso completion and verified sealed PDFs through an append-only completion projection. The isolated local worker now uses separate SCRAM credentials, a restricted function-only database role, durable leases/retries and signed PDF-verification receipts; HTTP application components use restricted clients, while the test driver retains separate privileged clients for fixture setup. Read `portal/docs/atrium-integration.md` before replacing fixture credential/proof provisioning or adding invoice adapters. Preserve both existing private proposal routes until per-client acceptance/cutover. Do not interpret passing characterization tests as a production security gate.

Phase 2 now has a local foundation under `portal/foundation/`: pinned local checkouts, versioned baseline migrations, separate database credentials, verified TLS, schema guards and a disposable database/artifact restore drill. Read its README for evidence and remaining gates. The full Atrium AppModule now passes invited signup, captured email verification and session checks with restricted Prisma credentials over verified TLS. Restricted-role claims, catalog HTTP access and gateway-store handoffs now use a scoped canonical-artifact copy function. The combined real-provider/browser gateway now uses a dedicated restricted database identity without owner/lifecycle credentials. The combined Atrium HTTP components now use restricted application clients, reviewed migrations and verified database TLS. The HTTP API now runs in a separate restricted container without fixture-owner, migration, gateway or lifecycle credentials; the driver reads captured mail and side-effect evidence through a read-only volume. The combined API now uses a random mounted auth secret and internal SMTP capture restricted to synthetic recipients. The encrypted recovery drill under `portal/recovery/` restores actual Documenso/gateway fixture databases and four signed PDFs, verifies signatures/hashes/bindings, and rejects tampering and target overwrite. The selected deployment target is Vercel at `clients.growthcast.app` with a new dedicated Supabase PostgreSQL project in B2B SaaS Inc. The RDS proposal is withdrawn and its unexecuted AWS change set has been deleted; supporting AWS services are provisional pending an inventory of the existing Supabase setup. `portal/deployment/` contains tested proxy helpers and a read-only Supabase catalog/connection preflight. The dedicated Supabase project `growthcast-clients-staging` (`saedetvoolpdysiyjwvg`) now exists on Micro in US East. Keychain-backed CLI authentication works. The separate six-migration managed Atrium baseline is now applied to `gc_atrium` in staging, preserving original foundation checksums. The real AppModule, namespace-scoped guard, TLS, restart and restore checks pass locally; live restricted-role guards and permission denials pass, and the temporary migration login is disabled. All six roles remain NOLOGIN. Documenso’s separate managed history (164 pinned upstream migrations, runtime permissions and a versioned restore-stable fingerprint fix) is now applied to `gc_documenso`. Its encrypted local private-schema recovery drill now preserves ownership/ACLs and verifies four signed PDFs, grant bindings, tamper/overwrite denial and resumed service health; off-host operational recovery remains open. The actual restricted provider passes native/SDK signing, four PDF signature checks and gateway boundary/restart/revocation tests locally; live guards and cross-schema/API denials pass. Its temporary migration login is disabled. Only empty `portal_api` is exposed to the Data API. Runtime credentials and deployment remain outstanding. TLS enforcement is enabled; legacy API keys are disabled and the legacy signing key is revoked. See `portal/deployment/supabase-managed-atrium-evidence.json` and `portal/deployment/supabase-managed-documenso-evidence.json` (initial audit/isolation retained separately). A protected Vercel staging project exists; production packaging, staging deployment and managed recovery remain open; see `portal/docs/phase-2-acceptance.md`.

The managed runtime startup wrapper under `portal/deployment/runtime/` now enforces exact application roles, verified TLS, private namespaces and read-only schema guards before child launch. Its seven containerized boundary tests pass. The pinned Documenso package now passes actual provider/Prisma startup over TLS/SCRAM, restart, drift refusal and repaired restart in an isolated disposable database. The packaged provider also passes native/SDK signing, four PDF signatures, restart, 588 route-boundary denials, expiry and revocation. A production-dependency Atrium API package now runs the actual upstream main/AppModule and passes TLS/SCRAM startup, private-route and uninvited-signup denials, restart and schema-drift refusal. The packaged API also passes invited signup, internal SMTP verification, invitation acceptance, organization isolation, restart-persistent sessions, logout/replay denial and existing-account login. A checksum-guarded staging mail patch permits only synthetic recipients. Private origin-proof ingress and named-volume artifact persistence now pass direct-access, cross-project/organization, membership-removal and container-recreation checks; the local storage prefix traversal check is fixed. Private Supabase bucket `gc-atrium-private` and a dedicated storage service identity are now provisioned; the compiled REST adapter passes live byte-exact upload/download/delete, overwrite, anonymous, other-identity and cross-bucket denials. Legacy keys stay disabled and the six database roles remain NOLOGIN. The complete packaged API now passes live managed-storage upload/download, container recreation and membership-revocation checks; exact-object cleanup and an independent empty-bucket inventory pass. Independent backup/recovery, portal adapters and scoped live database credentials remain outstanding.


A dedicated encrypted S3 archive destination now exists under `portal/deployment/offhost/`. Its scoped upload/restore sessions and exact-version round trip pass; the downloaded archive restores both synthetic provider/gateway databases and four signed PDFs with ownership, grants, signatures and tamper/overwrite checks. Archive data keys are now wrapped by a retained, annually rotated AWS KMS key; restricted-role recovery and migration of all four retained legacy keys pass, with no persistent local plaintext archive keys. The live Supabase staging snapshot now passes off-host restore into isolated local targets: 107 tables, 223 rows and one synthetic private-storage object, with matching data, owners/effective ACLs, both schema guards, access denials and verified source cleanup. See `portal/deployment/managed-recovery/`. Replacement-project/bucket recovery, scheduled backups, runtime secret distribution and deployment remain open. See `portal/deployment/offhost/kms-evidence.json`; the documented schedule is not enabled.

The dedicated `gc_backup` read-only login now passes TLS, both guards, permission denials and the complete 107-table/223-row off-host restore. Its connection is in Secrets Manager; an ECS-only backup task role passes twelve policy simulations. The six application/migration roles remain NOLOGIN. The separate Storage reader and digest-pinned ECS backup job now pass live one-off execution and independent recovery; daily staging backup/restore orchestration is enabled at 06:00 UTC. Hourly independent monitoring is enabled; notification routes are enabled for the confirmed recipient; SNS accepted the labeled delivery test, with inbox receipt confirmed by the operator. See `portal/deployment/backup/README.md`.

This file provides persistent context for AI agents working on GrowthCast. Read it fully before writing any code.

## Project overview

GrowthCast is a GTM Engineering agency site for Series A and later companies with product-market fit, plus a white-labelled, local-first subscription and ecommerce forecasting tool. The agency serves founders, CEOs, VC partners, and private-equity partners that need repeatable growth systems. Forecast users configure global and per-channel assumptions, compare B2C scenarios, inspect monthly outputs and channel attribution, and exchange versioned assumption sets as JSON or CSV. B2B and D2C expose explicit assumptions without scenario preset buttons. D2C uses transactional sales and finite repeat-purchase contribution rather than subscription revenue or churn. The current stage is a functioning static site deployed on Vercel with no monetization, accounts, or backend.

The primary activation action is changing an assumption or loading an assumption set and seeing the forecast update deterministically.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Astro static routes + React islands + TypeScript |
| Charts | Recharts |
| Documents/archives | jsPDF, JSZip, html2canvas, html-to-image |
| Icons | Lucide React |
| Backend/API | None; explicitly deferred |
| Database/ORM | None; explicitly deferred |
| Authentication/tenancy | None; local single-user app |
| Email/payments/storage/jobs/cache/search | Not applicable |
| Product analytics | PostHog browser SDK through a first-party Vercel/nginx reverse proxy |
| Persistence | Browser `localStorage` for reload-safe progress; JSON/CSV import/export |
| Unit tests | Vitest |
| E2E validation | Pi `playwright_validate` |
| Production runtime | Static Astro output on Vercel; nginx container remains the portable local runtime |
| CI/CD and public hosting | Vercel production deployment at `growthcast.app`; no repository CI workflow yet |

## Directory structure

```text
.
├── src/
│   ├── AgencyApp.tsx           # Lightweight agency island and contact flow
│   ├── App.tsx                 # Forecast island, local state, and exports
│   ├── channels.ts             # Channel types, legacy normalization, preset library, addition helper
│   ├── channels.test.ts        # Library and saved-channel compatibility regressions
│   ├── components/             # Astro shell and React island entry
│   ├── content/blog/           # Typed Markdown/MDX blog posts
│   ├── layouts/                # Shared Astro document/SEO layout
│   ├── pages/                  # Static routes, blog pages, RSS
│   ├── styles.css              # Agency/Forecast visual system
│   ├── blog.css                # Blog visual system
│   └── engine/
│       ├── forecast.ts                 # Pure deterministic forecasting engine
│       ├── forecast.test.ts            # Forecast invariants and regressions
│       ├── channelBreakdown.ts         # Cumulative baseline/channel cohort attribution
│       ├── channelBreakdown.test.ts    # Grouping and reconciliation tests
│       ├── metrics.ts                  # Cash flow, NRR, blended CAC, Magic Number
│       └── metrics.test.ts             # SaaS metric and cash-flow regressions
├── artifacts/                  # Local screenshots; ignored
├── Dockerfile                  # Test/build stage and nginx runtime
├── astro.config.mjs            # Astro, React, and sitemap configuration
├── nginx.conf                  # Static directory routing and portable server
├── vercel.json                 # Astro build, proxy routing, and security headers
├── package.json
├── package-lock.json
├── tsconfig*.json
├── eslint.config.js
├── README.md                   # User and contributor documentation
├── AGENTS.md                   # Concise coding-agent rules
└── CLAUDE.md                   # Persistent architecture context
```

There is no marketing site, authenticated app shell, server logic, schema, migration, queue, email, or admin directory. Do not create one without a product requirement.

## Common commands

Container-first workflow is mandatory.

```bash
# Required complete check: lint, tests, type check, production build
docker build -t growth-model .

# Run production image on localhost
docker run --rm -p 127.0.0.1:8080:8080 growth-model
```

Commands available inside the Node build container:

```bash
npm run dev
npm run lint
npm test
npm run build
npm run preview
npm run content:drift
npm run content:briefs:check
npm run content:inventory
npm run content:validate
npm run content:draft -- <approved-brief-id>
npm run content:generate -- <approved-brief-id> [--shadow] [--run-id <id>]
npm run content:preflight -- <slug>
npm run content:rendered
npm run content:schedule:dry-run
```

Formatting, database, email-preview, and worker commands are not configured. Mark new commands in this file when those systems are introduced.

## Architecture: the complete current stack

### Application shell

Astro owns route generation, document metadata, the blog, RSS, and sitemap. Public routes select one of two server-rendered, client-hydrated React islands: lightweight `src/AgencyApp.tsx` for agency pages and `src/App.tsx` for the Forecast product. This keeps charting and export libraries out of the agency page's initial dependency graph. Agency analytics load after the visitor's first interaction, with session replay, surveys, conversations, product tours, and feature flags disabled. The Forecast island owns UI state and local persistence orchestration. The forecast product starts at `/resources/tools/forecast` and renders Baseline, Forecast, Deep Dive, Channels, and Methodology. Global reset, import, format, and export controls live in the Tools dropdown immediately after Methodology. Forecast, Deep Dive, and Channels accept zero-valued B2C and B2B baselines so users can model from an empty or pre-revenue state. New and reset models default the baseline month to the user's current calendar month and the forecast start to the following month. Baseline owns the editable model name and selected model's opening metrics; forecast formulas stay in the engines. The Monthly Forecast table is backed by `src/engine/channelBreakdown.ts`, while `src/engine/metrics.ts` owns cash flow, NRR, blended CAC, and SaaS Magic Number calculations. Persisted and imported models pass through the shared version-aware validator before state setters run. Keep the app white-labelled. The editable model name controls document title and exported filenames and must round-trip through assumption JSON.

The Forecast island displays the standard `siteHeader`/`siteNav` above its tool header on every tool tab, with the same Company/Resources menus and contact entry point as the agency site. The tool title has no duplicate wordmark. Its `pageNav` is labeled "Forecast tool navigation" and contains only the tool tabs and Tools menu, not a redundant Agency button. Main-navigation links load the actual Astro agency/blog routes rather than rendering legacy agency views within Forecast; Let's Talk Growth links to `/?contact=1` so the canonical agency contact flow owns lead capture. Keep the model-name input and model-named titles/exports intact.

### Service pages

The `/services` index and `/services/[slug]` pages are Astro-native, using shared content in `src/services.ts`, scoped styles in `src/services.css`, and the existing static `BlogShell.astro` navigation/footer. There are eleven top-level services; paid-media platforms and content-marketing subservices remain sections on their parent pages. Each detail page has unique metadata, canonical URL, Service and BreadcrumbList schema, deliverables, measurement copy, related services, and links to `/?contact=1`. Astro includes the routes in the sitemap. Keep the Service Lines dropdown in agency, Forecast, and static/blog navigation, linking to the index and all eleven service pages. All public page headers include Client Login at `https://clients.growthcast.app/login`. `src/serviceNavigation.ts` supplies shared names and slugs without bundling service-page copy into React islands.

### Channel library UX

New and reset models start with an empty channel list. `src/channels.ts` owns channel types, the unchanged base/legacy defaults, membership-preserving normalization, and 65 illustrative planning presets: 20 Direct Response (CPC), 16 Demand Gen (CPM/CTR), and 29 Owned / Partner / Custom (manual launch visitors). `src/components/ChannelLibrary.tsx` provides a native, default-collapsed inline disclosure in each category, search, group filtering, assumption previews, duplicate prevention, hidden-channel restoration, and no-result feedback. Reuse the charcoal editor styling and Lucide icons; no modal, new dependencies, or forecast formula changes are needed.

New channels inherit the General B2C/B2B funnel defaults and start in month 1. Paid additions receive only the unallocated fraction of the shared budget (clamped to 0–100%); existing allocations are untouched. Owned additions always have zero paid allocation. Preset economics are explicitly illustrative USD planning inputs, not sourced benchmarks. For non-clickable media, CTR is a site-response estimate, not view-through attribution. Owned tactics use incremental visitor estimates and the existing global Sales & Marketing Overhead for non-media costs, not a new per-tactic cost model. Lifecycle presets are acquisition-traffic proxies, not retention lift. Only the existing `Partners` channel has recurring affiliate commission behavior (default 30% for 12 months).

`AppIsland.tsx` uses a React `useSyncExternalStore` hydration snapshot: render static defaults for the server and initial hydration, then remount the local model once to initialize from browser storage. The static pass must never persist, so an existing saved model cannot be overwritten before restoration. This also prevents saved channel/budget values from causing server/client hydration mismatches.

Normalize only supplied channels, preserving names, order, membership, edits, visibility, and activation; never merge the library into saved/imported models, and preserve empty arrays. Fill missing legacy fields from the historical base defaults rather than new preset economics. Assumption schema remains version 3 with versions 1/2 migration unchanged. Hide affects only visibility; live month 0 disables. Restore never resets edited assumptions. Remove clears that channel and its named monthly spend overrides while leaving other allocations untouched; re-adding uses fresh preset and General defaults. Announce additions/removals and restore focus after removal. Test new/empty/reset lists, search/filter/add, all three categories, allocation edges, saved legacy values, both business models, reload and JSON/CSV round-trips, hide/restore/remove, and mobile overflow.

### Operator content persistence

The public application remains static. Operator-only content automation uses the shared atomic filesystem queue under ignored `.content-runs/queue/` and exact publication-bundle records under `.content-runs/publication-bundles/`. The scheduler reads these records without creating approvals and fails closed unless shared artifact hashes, QA, and accountable bundle approval independently pass. This local queue is suitable for single-host operation; unattended production scheduling still requires a database-backed queue.

### Blog architecture

The public blog is Astro-native and has no backend, admin system, or remote content dependency. `src/content.config.ts` validates Markdown/MDX frontmatter in `src/content/blog`. Future-dated posts are excluded from routes, RSS, and the sitemap until a scheduled GitHub Action detects that they are due and calls the configured Vercel deploy hook. `/blog` renders image-led article cards with browser-side query and tag filtering suitable for static hosting; `/blog/[id]` preserves the MediaMixModel reference UX with breadcrumb and back navigation, author/read-time metadata, a boxed sticky table-of-contents/share rail that stacks on mobile, BreadcrumbList, and BlogPosting schema. Generate each post's standalone abstract artwork with `scripts/generate-blog-shape.html` and assign it to `artwork` for the article hero. Compose that artwork with article title, author, and publication date using `scripts/generate-blog-social.html`, then assign only the finished card to `image` for Open Graph metadata and `/blog` listings; never render the composed social card inside the article. `/rss.xml` and the Astro sitemap integration publish discovery feeds. Blog pages reuse the agency site's complete Company/Resources navigation and contact entry point, local Manrope/DM Mono fonts, and GrowthCast colors from the existing visual system.

Shadow generation from an approved brief executes research/evidence, prose, contextual visual planning, Google `gemini-3-pro-image` inline imagery, certified deterministic hero/thumbnail, exact-title Manrope/logo OG, complete visual QA/manifest, and an approval-null publication bundle. It writes only ignored local artifacts and cannot write source, upload, call databases/Sanity/deploy/indexing, or publish. Resume is bound to stable request and article hashes.

Every article draft and edit must follow `docs/editorial/human-first-writing.md`. Run the human-first agency, AI-signature, rhythm, specificity, and read-aloud passes before approval. The reproducibly vendored `@ejwhite/content-engine` contract and GrowthCast profile enforce hard rules during every container build. `content:preflight` requires passing QA and an approval for the exact canonical article hash; `content:rendered` checks built metadata, indexability, and `BlogPosting` JSON-LD.

### B2C and B2B model contracts

Baseline selects `b2c` or `b2b`; missing `businessModel` values from older saved state migrate to B2C. B2C remains gated on visitors, signups, new customers, total customers, and MRR. B2B is gated on visitors, MQLs, SQLs, new customers, total customers, and ARR; MRR and average monthly revenue per account are derived.

B2B potential closed-won customers equal `visitors × mqlRate × sqlRate × closeRate`; realized monthly wins are rounded to whole accounts. New MRR equals realized closed won × ACV ÷ 12, so it moves in whole monthly-contract increments. B2B has no independent revenue-churn assumption. Voluntary and delinquent logo churn, expansion, and downgrade are annual rates applied only in forecast months 12, 24, 36, and so on. Each event churns `round(opening customers × annual logo churn)` whole accounts, removes `churned accounts × ACV ÷ 12` from MRR, adds `opening MRR × annual expansion`, and removes `opening MRR × annual downgrade`. `dealCycleDays` shifts SQL-derived closes uniformly across actual calendar months. The latest complete month's B2B baseline MQL, SQL, and new-customer flow calibrates the global MQL, SQL, and close rates. Baseline traffic and every channel use this same pipeline contract, while channels can override MQL, SQL, close, and ACV assumptions. Forecast shows MQLs, SQLs, and closed won over time alongside realized MRR and ARR. Keep all B2B calculations in the engine and channel-attribution modules.

### Agency homepage

Marketing and blog footers display `Copyright {year} B2B SaaS Inc. DBA GrowthCast`, with the year computed at render time (build time for static blog pages).

The homepage positions GrowthCast as **GTM Engineering for Growth** for Series A and later companies with traction. Its hero copy spans the full content width; the AAARRR system appears lower on the page. The homepage covers Current Demand / Future Demand, anonymized directional proof, qualification, and the Forecast tool. `/why-growthcast` owns the cross-functional problem and GTM Engineering point of view. `/how-it-works` owns the engagement stages and operating changes and must not repeat the homepage. The Service Lines navigation item links to `/services`, with eleven dedicated service pages under `/services/*`. Capabilities still connect to one integrated growth plan. Use the website-copywriting skill, STE-100 clarity principles, and George Orwell's six rules. Use short plain active prose, avoid stale figures of speech and jargon, and do not use em dashes. Treat the current copy and proof as directional until the discovery answers confirm buyer language, scope, attribution, evidence, and publication permission.

### Growth Plan request

A persistent bottom banner rises from its tray 15 seconds after a user changes a Forecast assumption or Channel setting. While visible, its measured responsive height is added to the page's bottom spacing so no content is trapped behind the fixed banner. The close control always slides it away; after successful submission, scrolling also dismisses it with the same downward animation. Navigation does not trigger or cancel it; another qualifying change restarts the timer. It collects first name and email only after explicit submission, calls `posthog.identify(email, { email, first_name })`, and immediately captures `growth_plan_requested` with matching `$set` person properties through `fetch`. This ensures the custom event updates/creates the identified profile even when PostHog suppresses a redundant `$identify` event for an already-known distinct ID. At submission time, attach the current `Baseline` and `Assumptions` objects only to the custom-event properties as nested JSON values named `baseline` and `assumptions`; never attach model snapshots to identify or `$set` person properties. Successful submission is stored locally under `growth-plan-requested-v1`. PostHog browser traffic uses the same-origin `/ingest` reverse-proxy path; Vercel rewrites and nginx route US-region API, SDK asset, and remote-config requests to the appropriate PostHog hosts.

### Deep Dive analytics

Deep Dive is forecast-driven and must stay synchronized with editable baseline, global assumptions, budget, and channels. It contains Budget breakdown, Churn overview, MRR overview, Growth rate, Customers overview, and Cash flow tabs. Cash flow accepts fee/refund percentages, monthly and annual plan shares, and optional one-time payments as a third plan-share input. The active shares must total 100%. Monthly subscription cash equals ending MRR × monthly share. Annual and one-time cash each equal new MRR × their share × 12. Fees and refunds are negative percentages of gross cash; net cash sums all five movements. Every view requires both a chart and monthly table; do not substitute static screenshots or historical-only values. Budget lines begin at each paid channel's go-live month. The Deep Dive budget headline edits the global budget and clears stale month-specific budget overrides. Dragging a budget line point creates a month/channel spend override, proportionally redistributes the remainder among other enabled paid channels to preserve the monthly total, converts all affected spend to visitors with each channel's CPC or CPM/CTR model, updates the table, and recomputes downstream months. An opt-in future-edit toggle applies budget or churn point edits to the selected and all later months. Budget planning also supports compounded monthly percentage growth, isolated monthly total overrides, step totals that compound from a selected month onward, and subchannel spend editing. Keep these controls inside a default-collapsed Advanced budget controls disclosure. Dragging the churn line creates a monthly total revenue-churn override and recomputes the MRR bridge. Preserve these overrides in local storage and assumption import/export. Churn views preserve voluntary/delinquent and revenue/customer distinctions.

Editable Budget and Churn charts require chart-local reset controls. The global reset restores paid budget to $0, clears all month-specific overrides, and redirects to Baseline. Raw historical performance must not be bundled. All Deep Dive line series require tab-local show/hide controls; toggling one Deep Dive tab must not change line visibility in another. Mixed movement/total or monetary/rate charts require left and right Y axes whose zero ticks share the same vertical position at 80% of plot height. Use the same lower-zero domain for Cash flow so bars sit near the X-axis and whitespace remains above. Deep Dive currency tooltips require a currency prefix and exactly two decimal places. Loss movements such as churn and downgrade must remain negative below the X-axis; New and Expansion remain visible above it. Use one signed stack per monthly movement chart so positive and negative bars align rather than appearing staggered. People outputs (visitors, signups, new customers, churned customers, and customers) are whole numbers. Default and master-reset baseline values are zero to avoid exposing private company performance data. Baseline CSV exports include budget; importing a baseline applies its budget (defaulting to $0 when absent) and clears monthly budget overrides. Customer charts put new-customer movement on the right axis. Budget dragging snaps every rebalanced channel to $100 increments while preserving the monthly total; churn dragging snaps to 0.1 percentage-point increments. Forecast PDFs require chart pages for all three main Forecast charts and all six Deep Dive charts, plus dedicated Deep Dive table pages, using the current projection and saved monthly overrides.

### Forecast engine

`src/engine/forecast.ts` is a pure deterministic monthly simulation. Inputs are the user-configured baseline opening state, global assumptions, and channel assumptions. Outputs must be traceable to inputs and safe to recalculate on every state change.

Required invariants:

- Historical calibration covers August 2024–July 2026; August 2026 is partial.
- Visitor data uses unique `Page view` users.
- Signup data uses unique `User Signup` users.
- Baseline visitor-to-signup conversion is 13.7%.
- Baseline signup-to-purchase conversion is 0.8%.
- `daysToUpgrade` delays signup conversion into paid customers and new MRR. Assume signups arrive uniformly through each actual calendar month, shift them by the configured average delay, count only upgrades landing in the current month, and carry the remaining cohort into later months. The default is 3.0 days, the current trailing-30-day Mixpanel average from `User Signup` to `Plan Upgraded` for July 12–August 10, 2026 with a 90-day conversion window.
- B2C customer churn and revenue churn remain independently editable monthly rates. B2B removes revenue churn and instead uses annual logo churn, applied once every 12 forecast months to whole accounts; B2B churned MRR is the rounded churned-account count multiplied by `ACV ÷ 12`. Reconcile realized movement through `churnedCustomerArpu = churnMrr ÷ churnedCustomers` and `churnedArpuRatio = churnedCustomerArpu ÷ openingArpu`; expose both in Forecast diagnostics and churn CSV/PDF outputs.
- Channel traffic is introduced once at go-live, then compounds with global Traffic growth. Monthly paid-spend schedules become explicit adjustments to the compounded active cohort rather than replacing engine state.
- Live month `0` excludes the channel from traffic, spend, allocation, customers, and revenue; when a paid channel is changed to 0, redistribute its allocation proportionally across the other enabled paid channels so enabled allocation remains 100%.
- Direct response uses a selectable library including search, paid social, retargeting, native, review-site, marketplace, and custom tactics: `visitors = allocatedSpend / CPC`. No channels are preselected for new/reset models.
- Demand generation: `visitors = allocatedSpend / CPM * 1,000 * CTR`.
- Expected CPC is `allocatedSpend / visitors`.
- Partner assumptions include recurring affiliate commission percentage and commissioned months; defaults are 30% for 12 months. Estimate commission cost using channel ARPU and geometric monthly revenue retention over the commission window.
- Actual blended CAC is model-specific. B2C uses enabled paid launch spend plus one month of overhead and expected partner commissions divided by paid/partner acquired customers. B2B treats the overhead input as annual and divides annual overhead plus the first 12 forecast months of paid spend plus expected partner commissions by all new customers acquired during those 12 months.
- Predicted LTV is model-specific. B2C uses customer-weighted monthly acquisition ARPU × gross margin ÷ effective monthly revenue churn. B2B uses `(ACV × gross margin) ÷ annual logo churn`.
- Payback is model-specific. B2C divides blended CAC by customer-weighted monthly acquisition ARPU × gross margin. B2B divides blended CAC by `(ACV ÷ 12) × gross margin`.
- Expected LTV:CAC is predicted contribution LTV divided by blended CAC. Zero B2C revenue churn or zero B2B annual logo churn makes churn-based LTV and acquisition thresholds unavailable rather than zero.
- Ending-month NRR is `1 + expansion − downgrade − effective ending-month revenue churn`, including a saved month override.
- SaaS Magic Number is `(latest ending ARR − ending ARR three months earlier) ÷ latest three months of Sales & Marketing spend`. The denominator is the latest three modeled paid-budget months plus three months of overhead; divide the B2B annual overhead input by 12 before adding each month. Do not annualize the numerator with a ×4 multiplier. Show unavailable without four projected months or when denominator spend is zero.
- MRR bridge separately exposes new, expansion, downgrade, and churn movements.
- ARR is ending MRR multiplied by 12.
- People display as whole numbers. On the main Forecast page, ARPU, Ending MRR, Ending ARR, Max CAC, and Max cost/signup display as whole dollars; other UI values display at most one decimal place.

### Data

Private historical exports informed calibration but must not be committed, bundled, or deployed. Never embed credentials or raw private performance data; runtime starts from user-entered/imported baseline values.

### Assumption-set contract

JSON exports include:

- `schemaVersion`
- `exportedAt`
- `modelName`
- `baseline`
- `forecastStartMonth`
- `scenario`
- `budget`
- `assumptions` (including `daysToUpgrade`)
- `channelDefaults`
- `channels`

Exports use `schemaVersion: 3` and support JSON and a two-column CSV representation whose values are JSON encoded. Imports detect `.json` or `.csv`, migrate versions 1 and 2 to B2C defaults, and must parse and validate the entire object before changing state. Reject unsupported versions, missing fields, invalid channel models, negative values, non-finite numbers, and malformed arrays. If the shape changes, increment `schemaVersion`, document it, and provide a migration or clear compatibility error.

### Authentication, onboarding, and tenancy

Not applicable to this local single-user version. Do not add login, cookies, local-storage auth state, workspaces, or tenant logic speculatively. If a hosted multi-user version is approved, design server-side authorization and tenant-scoped persistence before implementation.

### Database, API, billing, email, storage, jobs, and caching

Not currently applicable. If introduced, use schema-as-code, reviewed migrations, explicit authorization, boundary validation, idempotent mutations, secure provider-hosted payments, verified webhooks, managed secrets, durable queues, explicit cache TTLs, and least privilege. Never simulate durable infrastructure with browser state or `setTimeout`.

### Observability and analytics

PostHog captures product interaction events through a same-origin reverse proxy. The Growth Plan form identifies a person with their submitted first name and email only after explicit submission. The `growth_plan_requested` event includes the current `baseline` and `assumptions` JSON objects, but those objects are not person properties. Browser console errors must remain zero in validation. Never send secrets or imported files to analytics.

The agency contact form posts only the governed lead fields to the same-origin `/api/lead` serverless endpoint. That endpoint validates the payload and consent, assigns a UUID-based submission ID, and captures one `lead_form_submitted` event in PostHog. Browser code must never call Attio directly or receive server-only PostHog configuration. The form must not show success when delivery fails or the browser is offline; preserve its explicit error state and keyboard-modal focus behavior.

### Security

The app is static and local-first. Baseline and assumption progress is persisted under versioned local-storage key `growth-model-state-v1`; malformed or unavailable storage must fall back safely. Maintain these controls:

- No credentials, secrets, or live API tokens in the bundle.
- Validate imported files before state mutation.
- Do not execute or inject imported content as HTML or code.
- Keep dependencies pinned through `package-lock.json` and review additions.
- Bind local container examples to `127.0.0.1`.
- Preserve Astro's generated per-page hash-based CSP, including the narrowly scoped Vercel Toolbar origins, plus the deployed HSTS, frame, MIME, referrer, and permissions-policy headers. Keep nginx aligned for all applicable non-TLS protections; do not add a second static CSP header that blocks Astro hydration hashes.
- Never log imported financial assumptions unnecessarily.

### Marketing, SEO, legal, internationalization, notifications, and admin

Public routes include appropriate metadata, canonical URLs, robots/sitemap policy, privacy and terms documents, and automated production-only IndexNow submission from the generated sitemap. Preserve the root verification key and keep search-engine notification disabled for preview and local builds. Localization is deferred; keep formatting centralized with `Intl` so future locale support remains possible. Do not add an admin panel or notifications without a backend and explicit requirements.

### CI/CD and deployment

Production deployment is the Vercel project `b2b-saas/growth-model`, configured by `vercel.json`; the Docker/nginx image remains the local and portable validation path. Any future CI must block merges on lint, tests, type check, build, and risk-relevant Playwright checks. Use immutable artifacts, managed secrets, preview validation, and documented rollback. Do not run unsafe automatic migrations if persistence is later introduced.

## Testing

- Add unit tests for every forecast, channel-attribution, or state-independent metric invariant.
- Test edge cases: zero churn, zero CPC/CPM, zero allocation, live month zero, delayed go-live, empty channels, channel/category reconciliation, and deterministic repeated runs.
- Use Playwright for page navigation, channel tabs, hide/restore, JSON round-trip, export downloads, responsive overflow, accessibility attributes, and zero console errors.
- Use stable labels and roles rather than coordinates.
- A change is not complete until container lint, tests, type checking, and build pass.

## Data and exports

Forecast CSV bundle, shareable forecast PDF, assumption JSON/CSV, and PNG snapshots are generated entirely in the browser. CSV forecast export downloads a model-named ZIP containing exactly seven root-level files: `forecast.csv`, `budget-breakdown.csv`, `churn-overview.csv`, `mrr-overview.csv`, `growth-rate.csv`, `customers-overview.csv`, and `cash-flow.csv`; all use raw portable values from the current projection and saved overrides. Every Forecast and Deep Dive chart exposes an image-download icon that captures its current visible state into an exact 1230 × 600 PNG. Chart exports must use the locally served Manrope/DM Mono site fonts, include the chart title and description, wait for Recharts animation completion, and fit the complete rendered chart into the image stage without letterboxing or clipped axes. The ten marquee metric cards export together as a designed exact 1200 × 1200 PNG with a title and description. PDF generation uses synchronously loaded jsPDF so browser download activation is retained and must include model identity, generation context, summary metrics, core assumptions, monthly forecast, and a planning disclaimer. Filenames derive from the sanitized model name. Exports must contain no credentials and should remain portable. A future hosted archive/export feature would require authorization, expiring downloads, retention policy, encrypted backups, and restore testing; these are not part of the current app.

## Accessibility

Target WCAG 2.2 AA:

- Every input must have an associated accessible label.
- All pages, tabs, details, buttons, and file controls must be keyboard operable.
- Preserve visible focus indicators and sufficient contrast.
- Use semantic controls instead of clickable generic elements.
- Announce import success and errors with an appropriate status region.
- Respect reduced-motion preferences if motion is added.
- Validate desktop and mobile layouts before release.
- Keep all agency navigation reachable on mobile, use at least 44px touch targets for primary controls, and preserve readable chart axes with contained horizontal scrolling rather than compressing them beyond legibility.

## Environment variables

- `VITE_POSTHOG_KEY`: browser-safe PostHog US project token. Browser analytics remain disabled when omitted. Production should set this in Vercel project settings; never commit a real value.
- `POSTHOG_PROJECT_TOKEN`: server-only project token used by `/api/lead`; never expose through a `VITE_` name.
- `POSTHOG_CAPTURE_HOST`: optional server capture origin; defaults to `https://us.i.posthog.com`.
- `OPENROUTER_API_KEY`: required server/operator-only credential for `content:generate`. Never expose it through a `VITE_` variable.
- `OPENROUTER_MODEL`: required OpenRouter model identifier for research and generation.
- `OPENROUTER_BASE_URL`: optional OpenRouter-compatible API root; defaults to `https://openrouter.ai/api/v1`.
- `OPENROUTER_MAX_ATTEMPTS`: optional bounded HTTP attempt count from 1 to 10; defaults to 3.

Do not create secret-bearing `.env` files. If more variables are introduced, add a secret-free `.env.example`, distinguish server-only from browser-safe values, validate them at startup, and document every variable here.

## Terminology

- **Model name**: User-supplied white-label name stored in assumption JSON.
- **Baseline**: B2C supplies opening visitors, signups, new customers, total customers, and MRR. B2B supplies steady-state visitors, MQLs, SQLs, wins, total customers, and ARR; funnel throughput calibrates the global pipeline rates. Live forecast calculations use baseline visitors, customers, and MRR.
- **Scenario**: Named set of global forecast assumptions.
- **Baseline traffic**: Historical visitor base compounded by global Traffic growth.
- **Channel defaults**: General-tab B2C conversion/ARPU or B2B pipeline/ACV values applied immediately to every subchannel and inherited by future library additions; individual values may then diverge.
- **Channel**: Acquisition source with a go-live month and funnel assumptions.
- **Subchannel**: Individually configurable paid or owned channel within a tab.
- **Channel cohort**: Cumulative customers and MRR attributed to one launched channel after applying the global logo churn, revenue churn, expansion, and downgrade assumptions each month.
- **Channel category subtotal**: Sum of active channel cohorts under Direct Response, Demand Gen, or Owned / Partner / Custom; together with Baseline / Existing Business these reconcile to the parent Monthly Forecast row.
- **Live month**: Forecast month when one-time channel traffic enters; `0` means disabled.
- **Traffic growth**: Global monthly efficiency growth applied to active traffic.
- **Direct response**: Paid channel modeled from budget allocation and CPC.
- **Demand generation**: Paid channel modeled from budget allocation, CPM, and CTR.
- **Revenue bridge**: New MRR plus expansion less downgrade and churn.
- **Logo churn**: Customer-count churn, distinct from revenue churn.

## Known agent failure patterns

Agents must not:

- Reintroduce a company-specific name into this white-labelled app.
- Put forecasting formulas in React rendering code.
- Treat channel launch traffic as a recurring monthly addition.
- Count a live-month-zero channel in allocation, spend, traffic, or revenue.
- Merge revenue and customer churn.
- Change `User Signup` back to another signup event.
- Import JSON without complete validation or silently accept unsupported schemas.
- Display fractional people in the monthly table.
- Add dependencies without checking existing capabilities and maintenance risk.
- install dependencies on the host.
- Commit `.env`, secrets, `CONTINUITY.md`, screenshots, dependencies, or build output.
- Omit loading, error, empty, or invalid-file states when relevant.
- Claim completion without lint, tests, type checking, build, and UI validation.

Treat this file as a living document. Update and commit it whenever architecture, assumptions, commands, integrations, or recurring agent mistakes change.

## Forecast Growth Plan requests

`/api/growth-plan` validates bounded JSON requests and sends `growth_plan_requested` server-side to PostHog, never directly to Attio. The browser redirects to `https://cal.com/growthcast/growth-plan-review` only after HTTP 202, preserving the form on failure. Submissions include explicit marketing disclosure version, identity, submission UUID, and `forecast_json` (baseline and assumptions). The UUID is reused for in-page retries; downstream consumers must independently deduplicate. Forecast JSON is restricted request data, not a general dashboard property.

CRM routing must match/create People and business-domain Companies, never Deals; assign operator review without an SLA. The existing PostHog destination mapping must be reviewed/tested before rollout: JSON download in Attio, booking callbacks, and CRM outcomes are not verified by endpoint tests. A redirect is not a confirmed booking. No automatic plan delivery is implemented.

## Private client proposal routes

`/clients/proposals/bluealpha` and `/clients/proposals/photoshelter` are explicitly requested exceptions to the otherwise unauthenticated static site. Isolated Vercel functions validate separate server-side PINs and issue separate eight-hour signed, Secure, HttpOnly, SameSite=Strict cookies. Responses are no-store/noindex, excluded from sitemap/analytics, and protected on direct API access. BlueAlpha uses an eight-digit PIN and serves encrypted HTML/PDF. PhotoShelter uses a four-digit PIN and serves its encrypted supplied HTML.

BlueAlpha requires `BLUEALPHA_PIN_SHA256`, `BLUEALPHA_SESSION_SECRET`, and `BLUEALPHA_CONTENT_KEY`; PhotoShelter requires the corresponding `PHOTOSHELTER_*` variables. PIN hashes are lowercase SHA-256, session secrets contain at least 32 random bytes, and content keys are 32-byte lowercase hex. Configure Preview and Production independently. Never commit or expose PINs, secrets, plaintext proposals, or decryption keys. Each function has a bounded per-instance failed-attempt limiter, not a distributed rate limit.

Encrypted proposal bundles live under `server-assets/*.enc`, using gzip plus AES-256-GCM. Vercel includes each file only in its matching function. Decryption happens only after session validation; nginx never serves these routes. Updating content requires re-encryption/deployment, and changing a content key requires re-encryption. Keep plaintext source outside the repository and validate anonymous/direct access, PIN failure, sessions, CSRF, logout, missing configuration, and throttling.


## D2C / Ecommerce forecast mode

Baseline now offers D2C / Ecommerce alongside the existing B2C and B2B subscription models. D2C uses the same Forecast sidebar, channel category tabs, searchable library, budget allocation, General defaults, and expandable hide/restore controls as B2C/B2B. Only the model-specific inputs and calculations differ. Baseline stays focused on opening metrics; commerce assumptions live in the Forecast sidebar and advanced budget overrides in Deep Dive. Switching modes preserves the other model's assumptions; Master Reset clears both and returns to B2C. D2C starts with zero acquisition visitors and previously acquired customers, illustrative order/cost assumptions, no repeat purchases, and no channels.

The D2C baseline is the last complete month, acquisition-only visitors and previously acquired customers. Forecasting begins the following month. Acquisition visitors exclude returning-buyer traffic. First purchases equal source visitors times source conversion rate, rounded to whole buyers. One first order is placed per new buyer. Repeat buyers are the opening cumulative customers times the monthly repeat buyer rate; repeat orders use orders per repeat buyer. New buyers join the repeat pool next month. Customer counts accumulate without subscription churn; repeat purchase probability controls ongoing commerce activity. Sales are first-order value plus repeat-order value each month, with no MRR balance, ARR annualization, signup funnel, renewals, expansion or downgrade.

Calculation ownership remains in `src/engine/forecast.ts` (`forecastEcommerce`), `src/engine/channelBreakdown.ts` (source/category reconciliation) and `src/engine/metrics.ts` (commerce costs and metrics). The separate `src/ecommerce.ts` contract prevents accidental subscription input reuse. `src/components/ChannelRow.tsx` and `ChannelLibrary.tsx` are shared across all three modes; D2C supplies first-purchase conversion, order value and one-time commission fields. D2C channels support CPC, CPM/CTR and manual launch traffic, per-source conversion/AOV, first-purchase commissions, launch disabling, budget growth and isolated/forward monthly spend overrides. Traffic launches once and compounds globally; paid spend changes adjust that cohort by the change in purchased traffic. Repeat orders retain original acquisition attribution. Commission applies once to first-purchase sales after refunds.

Net sales deduct refunds; COGS uses gross sales times one minus product gross margin (refunded product cost is not recovered). Fees apply to gross sales; fulfillment applies per order. Contribution deducts COGS, fees and fulfillment; contribution after marketing also deducts spend, commissions and monthly overhead. Cash receipts assume same-month payment net of fees/refunds. Inventory purchases, settlement timing, taxes and other fixed operating costs are outside this planning model.

Commerce metrics replace SaaS metrics: orders, net sales, cumulative unique buyers, AOV, blended CAC, paid acquisition ROAS, MER, 12-month contribution per acquired buyer, maximum CAC and contribution after marketing. CAC includes all marketing cost divided by all new buyers. ROAS uses net first-purchase revenue attributed to paid CPC/CPM channels divided by their spend. MER uses all net sales divided by all marketing costs. Twelve-month contribution includes the first order plus eleven expected months of repeat orders, using acquisition-weighted first-order AOV. Maximum CAC is nonnegative twelve-month contribution divided by the target contribution:CAC ratio. Undefined denominator ratios are unavailable. This finite value is not churn-derived perpetual LTV.

D2C progress uses the existing `growth-model-state-v1` key with additive `activeModel` and validated `ecommerce` fields. Legacy saved state defaults to subscription mode. D2C assumption JSON and two-column CSV use a version 4 discriminated envelope (`schemaVersion`, `businessModel: "d2c"`, `modelName`, `ecommerce`). Additive optional `budget`, per-channel `allocation`/`hidden`, and `channelDefaults` fields support the shared channel controls. Older version-4 files derive the paid budget and shares from their saved channel spends without changing projections. Version 4 is validated atomically before mutation; versions 1–3 retain their existing subscription migration/export contracts. Switching models does not migrate dollars between recurring revenue and order value.

D2C CSV ZIP exports contain seven root files with commerce-specific names: `forecast.csv`, `budget-breakdown.csv`, `orders-overview.csv`, `revenue-overview.csv`, `growth-rate.csv`, `customers-overview.csv`, and `cash-flow.csv`. They include effective monthly budget overrides and commerce costs. PDF reports contain identity, assumptions, channel settings, all seven tables and six vector charts. Visible chart PNGs retain the exact 1230 × 600 export format, with the ten-metric PNG at 1200 × 1200. The existing seven-file subscription ZIP contract is unchanged. The subscription Growth Plan prompt is not shown in D2C because its current request payload requires subscription assumptions.


D2C Forecast and Deep Dive use the existing presentation conventions: the same metric-definition tooltips and image export component, two five-card metric rows, an order-contribution diagnostic, a full-width revenue trajectory, paired revenue-bridge/customer-growth charts, and the same expandable monthly table. Deep Dive shows one selected chart and its corresponding monthly table under Budget breakdown, Orders overview, Revenue overview, Growth rate, Customers overview, and Cash flow tabs. It shares the chart palette, signed movements, axis alignment, tab-local line toggle, compact image exports and responsive overflow handling. Budget points support $100 dragging and equivalent keyboard inputs, preserving monthly totals by redistributing spend among other live paid channels. Advanced controls support isolated/forward totals and channel overrides; cash-flow fees/refunds edit the same commerce assumptions. Growth compares net sales with the previous projected month, is unavailable for the first month or a zero comparison base, and uses the same engine-derived values in tables and exports.

## Service lines

`/services` lists eleven service lines. `src/serviceNavigation.ts` supplies shared navigation labels and routes; `src/services.ts` supplies page copy. Astro generates `/services/{slug}` pages with capabilities, deliverables, measurement, related services, contact links, canonical metadata, and Service/BreadcrumbList structured data. Pages are included in the sitemap.

Strategy (`/services/strategy`) covers customer focus, positioning, growth planning, and resource choices. AI Enablement (`/services/ai-enablement`) covers workflow assessment, implementation, quality checks, and team adoption. Fractional Growth Leadership (`/services/fractional-growth-leadership`) covers senior growth ownership, execution cadence, team development, and leadership transition. These complement the eight existing service lines and share their layout. Keep Why GrowthCast, How We Work, and Forecast as distinct pages.

The backup capture now uses a separate read-only Supabase Storage Auth identity alongside `gc_backup`. The reviewed nine-policy bucket boundary and live read/write/delete/cross-bucket denials pass. The existing managed backup secret is schemaVersion 2 with both read-only credentials; synthetic fixture creation/cleanup are isolated from capture. The full encrypted archive restore passes with these readers. See `portal/deployment/storage/backup-evidence.json`. The separate all-object capture now reads both private applications from one exported snapshot, verifies all four Atrium file-reference types and refuses conflicting object changes. Empty-bucket and three-object KMS/S3 restore checks pass; real PostgreSQL tests prove intervening writes do not split the dumps. See `portal/deployment/backup/CAPTURE.md`. The digest-pinned non-root ECS job now passes managed-secret/task-role delivery, capture, KMS wrapping, versioned create-only archive/receipt uploads and metric emission. Both empty-bucket and three-object task archives independently restore 107 tables and 223 rows; the latter restores all 2,101 object bytes. See `portal/deployment/backup/job/README.md`. Daily staging backup/restore orchestration is enabled at 06:00 UTC. Independent restores now write append-only verification records that backup identities cannot write. A separate restricted ECS monitor has passed an actual EventBridge invocation and runs hourly. It rejects stale/missing/invalid records and unresolved restore failures; health, heartbeat and stopped-task alert routes are provisioned. SNS delivery to `ewhite@growthcast.app` is confirmed and notification routes are enabled. SNS accepted one labeled delivery test; the operator confirmed inbox receipt. Daily staging backup/restore scheduling is now enabled; see the orchestration evidence. See `portal/deployment/backup/verification/README.md`. Unattended independent restore, operational retry/capacity/RPO/RTO acceptance and replacement-project recovery remain open.

An intentional ECS task exit now passes the actual deployed stopped-task alert route: EventBridge reports successful SNS target delivery. The test used the pinned backup image with no task role or source credentials, performed no capture, and its temporary revision was deregistered. The earlier SNS test has operator-confirmed inbox receipt; receipt of this specific failure alert remains unconfirmed. See `portal/deployment/backup/verification/failure-route-evidence.json`. Automatic backups remain unscheduled; unattended independent verification is the next scheduling dependency.

The isolated restore verifier is now packaged under `portal/deployment/backup/restore-worker/`. Its non-root container uses a read-only root filesystem, no network or cloud/source credentials, and PostgreSQL over a private Unix socket. It independently verifies the deployed archive’s 107 tables, 223 rows and three objects (2,101 bytes), both guards, ACL/role denials and occupied-target refusal; the existing Compose verifier agrees and a new durable verification record is published. Deployment checks, portal lint and the public Docker build pass. Unattended archive retrieval/decryption, ECS verifier role/deployment, orchestration and backup scheduling remain open.

The digest-pinned independent ECS restore worker now passes autonomous exact-version S3 retrieval, context-bound KMS decryption, isolated PostgreSQL/object restoration and append-only verification publication. It verified 107 tables, 223 rows and three objects (2,101 bytes) without source credentials or operator-side decryption. Its dedicated role passes nine permission cases; the separate deployed monitor accepts its durable record and reports healthy recovery. See `portal/deployment/backup/restore-worker/evidence.json`. Receipt selection and recurring backup/restore orchestration remain open; neither schedule is enabled.

Daily staging backup and independent restore verification are now enabled at **06:00 UTC**. The Step Functions workflow runs the pinned backup, passes its exact receipt to the separate verifier, and releases its exclusive lock only after successful verification. Both manual and actual EventBridge-triggered executions passed (107 tables, 223 rows, currently empty source bucket); the prior three-object restore remains independently verified. Competing lock acquisition and wrong-owner release are denied. Workflow failure/timeout/abort and scheduler failures alert the confirmed operator, alongside hourly freshness monitoring. See `portal/deployment/backup/orchestration/evidence.json`. Failed runs retain the lock for explicit recovery. This accepts bounded staging operations; production-volume capacity/retry/RPO/RTO, replacement-project application recovery, runtime secrets and portal deployment remain open.

Replacement managed database and storage recovery now passes in a fresh temporary Supabase Micro project in B2B SaaS Inc.: 107 tables, 223 rows and three objects (2,101 bytes), with matching row digests/owners/effective ACLs, both guards, actual restricted-role denials, target overwrite refusal, recreated writer/reader Auth identities and nine storage policies. Original object keys/bytes are restored; private Data API/anonymous access and reader mutations are denied. An existing reader token loses access when its policy is revoked and regains access after reinstatement. Immutable checksummed configuration snapshots fix the observed mutable-config handoff failure. The temporary project and archive volumes are deleted; an independent inventory finds no remaining drill projects/volumes and staging is healthy. Daily backup/restore scheduling remains enabled. See `portal/deployment/replacement-recovery/evidence.json`. Restored application startup/account/signing flows, production-volume/RPO/RTO acceptance, runtime secrets and portal deployment remain open.

Packaged application recovery now passes against a freshly restored temporary Supabase project. Both Atrium and Documenso pass restricted TLS startup and health after container recreation; the Atrium API passes synthetic invited signup, captured verification mail, organization isolation, private managed-file access/persistence, membership revocation, logout/replay denial and existing-account login. The drill exposed a writable pooled session default: the startup guard now explicitly uses a read-only transaction, retains every identity/TLS/schema check, and rejects a real zero-row write with PostgreSQL `25006`. It avoids setting a session-wide read-only default that could affect later application connections. Both local package regressions, deployment checks, portal lint and the public build pass. Temporary application roles return to NOLOGIN and the project, containers and volumes are removed. See `portal/deployment/replacement-recovery/application-evidence.json`. This uses new synthetic app secrets and accounts; recovery of existing authentication/encryption/signing secrets, managed signing flows, production-volume/RPO/RTO acceptance and portal deployment remain open.

Recovery of existing synthetic application/signing secrets now passes through exact-version S3 retrieval and context-bound KMS under `portal/deployment/secret-recovery/`. The drill stops consumers and removes original selected secrets, plaintext snapshots, ciphertext and data keys before retrieval; tampered/wrong-key archives, wrong KMS context/role, duplicate uploads, unsafe destinations and occupied targets are denied. Atrium retains its pre-loss account session and file access after recovering the same auth secret and origin proof, then passes membership revocation/logout/replay tests. Documenso creates four new native/SDK sealed PDFs after recovering its original application keys and ephemeral self-signed certificate; all four OpenSSL signature checks, restart, route-boundary, expiry and revocation checks pass. The first signing browser attempt crashed with SIGSEGV; its evidence is retained and the complete retry passes. Full fixture and plaintext-volume cleanup is independently verified. These are disposable test secrets under staging recovery permissions, not production secret provisioning or certificate trust acceptance. Production secret escrow/access separation and delivery, encrypted integration-record recovery, managed signing, production-volume/RPO/RTO acceptance and deployment remain open. See `portal/deployment/secret-recovery/evidence.json`.

Separate staging runtime-secret boundaries are now provisioned under `portal/deployment/runtime-secrets/`: Atrium and Documenso each have their own retained, rotating KMS key, Secrets Manager entry and ECS-only task role. New auth/encryption/origin-proof material is initialized once and version-pinned; database/admin/Storage credentials and signing certificates are excluded. Both actual non-root Fargate consumers retrieve only their own version and materialize mode-0400 files in mode-0700 directories. All 16 live denial checks pass, including cross-application/backup-secret reads, secret writes, direct KMS decryption, and runtime-secret/key access under the existing backup and restore task roles. Valid non-secret KMS canaries distinguish authorization from malformed ciphertext. Plaintext files are removed and probe task definitions deregistered. Account root remains the explicit administrative recovery exception. See `portal/deployment/runtime-secrets/evidence.json`. Startup integration, application-UID handoff, database/Storage credential delivery, separately scoped web-proxy proof delivery, operational secret recovery/rotation, signing-certificate provisioning and staging deployment remain open; no application service or database login was enabled.

Both actual application packages now pass strict delivered-secret-file startup with synthetic local material. The wrapper requires service-specific fields, mode-0400 files inside a mode-0700 directory owned by the application UID (Atrium 1000, Documenso 1001), rejects duplicates/malformed material/symlinks and never falls back when materialized mode is selected. Atrium origin proof must match its separate ingress mount. TLS/schema guards, restart and drift refusal pass for both packages; Atrium account/session/file persistence, membership revocation and logout/replay also pass. Deployment checks, portal lint and the public Docker build pass. See `portal/deployment/runtime/secret-files-evidence.json`. Cloud retrieval into actual application containers, database/Storage/proxy credential delivery, operational live-secret recovery/rotation, signing-certificate provisioning and staging deployment remain open. No staging application login or service was enabled.

The actual Atrium and Documenso application images now pass live ECS task-role retrieval and strict private-file consumption of their pinned staging Secrets Manager versions under UIDs 1000 and 1001. The startup wrapper supports `GC_SECRET_MODE=secretsmanager`, refuses static/alternate credentials and version/ownership mismatches, and keeps inherited AWS credential settings out of the application environment. Both readonly-root Fargate probes removed their plaintext files and exited successfully; temporary task definitions were deregistered. Local actual-application regressions, deployment checks, portal lint and the public build pass. See `portal/deployment/runtime-secrets/package-evidence.json` and `package-regression-evidence.json`. These probes exercise delivery inside application images, not running cloud application servers. Database/Storage and separately scoped web-proxy credential delivery, operational live-secret recovery/rotation, signing-certificate provisioning and full staging deployment remain open. No application database login or service was enabled.

Database and Storage connection delivery is implemented locally under `portal/deployment/runtime-connections/`. It adds separate exact-role/version connection secrets, validates the restricted database role and pinned TLS CA, and confines Storage writer credentials to Atrium. Both local packages, connection tests, deployment checks, lint and the public build pass. Live provisioning stopped at the initial AWS identity check because the CLI session expired; no cloud or database mutation occurred. Version pins are intentionally empty until provisioning. A live read-only audit confirms all six application/migration roles remain NOLOGIN. The prepared cloud runner will verify restricted managed connections and actual packaged application health, then stop tasks and disable logins; it has not run. See `portal/deployment/runtime-connections/local-evidence.json`. Renew AWS CLI authentication before live provisioning; previously published application images remain unchanged.

Cloud connection-secret delivery and actual managed application startup now pass under `portal/deployment/runtime-connections/`. Separate retained connection secrets contain only each application’s restricted database identity and pinned TLS CA; only Atrium receives the scoped Storage writer identity. Both real packages start on Fargate with task-role-delivered cryptographic and connection material, pass TLS/schema guards and loopback health, and remove plaintext on shutdown. Cross-application connection-secret reads, four cross-schema/catalog reads, and all four reads under the actual backup/restore roles are denied. Atrium verifies its Storage identity and private-ingress denial. An independent audit confirms all four temporary tasks stopped successfully, task definitions inactive and all six application/migration roles returned to NOLOGIN. Deployment checks, portal lint and the public build pass. See `portal/deployment/runtime-connections/package-evidence.json` and `cleanup-audit-evidence.json`. Cloud account/file/signing flows, separately scoped proxy credential delivery, live-secret recovery/rotation, signing-certificate provisioning, production-volume/RPO/RTO acceptance and public staging deployment remain open; no persistent application service or public ingress was enabled.

The actual Atrium account/private-file flow now passes on Fargate with cloud-delivered auth, origin, restricted database and scoped Storage credentials. The isolated task verifies synthetic invited signup and captured email verification, organization isolation, private file upload/download and access denials, session/file persistence across an application process restart, membership revocation, logout/replay denial and existing-account login. The capture-mail helper now permits only its existing `mail` hostname or task-loopback `127.0.0.1`; synthetic recipient restrictions remain enforced. Independent read-only verification finds all 52 Atrium table row digests/counts identical before and after, no test objects, a stopped task/inactive definition, matching image/code/role bindings and all six application/migration roles NOLOGIN. Local package regression, deployment checks, lint and the public build pass. See `portal/deployment/cloud-account/package-evidence.json` and `audit-evidence.json`. This verifies HTTP flows and process restart within one isolated task, not browser/HTTPS or full task replacement. Managed signing, separately scoped proxy proof delivery, live-secret recovery/rotation, signing-certificate provisioning, production-volume/RPO/RTO acceptance and public staging deployment remain open.

The private API origin proof is now handed to the protected Vercel staging project as the sensitive, preview-only `PORTAL_API_ORIGIN_PROOF` variable. No application auth, database, encryption or Storage credentials were transferred. Create-only API and independent metadata audits verify the exact project/team, variable scope/type, current AWS source version and preserved all-deployment protection. The saved Vercel login refreshed through the pinned CLI without another user sign-in. A server-runtime adapter and deterministic tests cover proof injection, credential/header filtering, origin checks, private responses, cookie handling and error redaction. See `portal/deployment/proxy-secret/evidence.json` and `audit-evidence.json`. Runtime consumption is explicitly unverified: no Vercel function/application or HTTPS proxy route was deployed during this handoff. Proxy/HTTPS integration, managed signing and remaining Phase 2 acceptance remain open.

Staging HTTPS preparation now has an ACM certificate request for exactly `api.clients.staging.growthcast.app` in us-east-1. It is pending DNS validation, not issued or attached to a listener. Live DNS discovery identifies Cloudflare as authoritative; Vercel has external DNS and no hosted records. The exact DNS-only CNAME is saved in `portal/deployment/https-ingress/cloudflare-validation.txt`, with the resumable request receipt in `certificate.json`. DNS access is required next; no DNS record, application service, database login or Vercel deployment changed. Actual HTTPS/proxy/browser acceptance and Phase 2 remain open.

Cloudflare MCP is now available and verified against the B2B SaaS Inc. growthcast.app zone. The exact staging API ACM validation CNAME was created with DNS-only routing, automatic TTL and no CNAME flattening; independent API read-back and authoritative DNS resolve the expected value. AWS ACM now reports ISSUED and validation SUCCESS for the staging API certificate. See `portal/deployment/https-ingress/dns-evidence.json` and `certificate.json`. This resolves the DNS-access/validation blocker; the certificate is not yet attached to an HTTPS listener, and the staging service, Vercel deployment and browser acceptance remain open.

The staging HTTPS backend and protected Vercel proxy are now deployed and verified. A dedicated add-only AWS stack runs one restricted Atrium task behind a TLS 1.2/1.3 HTTPS-only load balancer; Supabase remains the database, with only gc_app enabled and the other five runtime/migration roles disabled. Cloudflare routes clients.staging.growthcast.app to the protected Vercel preview and api.clients.staging.growthcast.app to the load balancer. Live tests prove proxy proof consumption, direct/forged-proof API denial, anonymous private-file denial, and missing/cross-origin mutation denial. Independent service audit verifies health, image/role/command, security-group ingress and database role flags. See portal/deployment/https-ingress/audit-evidence.json and portal/deployment/web-proxy/evidence.json. The frontend is a staging verification page plus the real proxy, not the full Atrium UI; authenticated browser account/file flows, managed signing, operational live-secret recovery/rotation and remaining Phase 2 acceptance are open. Persistent staging compute/load-balancer resources are running.

A full ECS task replacement also passes: the original task stopped, a different task retrieved the existing cloud credentials and became healthy, and all HTTPS/proxy denial checks passed again against the replacement. See portal/deployment/https-ingress/replacement.json. Existing authenticated account/session/file persistence across that replacement is not yet claimed. Focused deployment/proxy tests (10), portal lint, infrastructure validation (with intentional fixed-zone warning W3010 excluded), Python/JSON parsing and live Vercel/service audits pass.

The pinned Atrium frontend now replaces the staging verification page at clients.staging.growthcast.app. Browser requests use the same-origin proxy; server-rendered account/branding/layout reads use a server-only version of the same boundary with no-store requests. Local and Vercel production builds pass, and all-deployment protection plus the exact three preview variables remain verified. The complete browser run passes existing synthetic user login, authenticated SSR reload, secure host-only cookies, UI private-file upload/byte-identical download, cross-organization denial, revoked-file GET/HEAD/Range denial, UI logout and session replay rejection. Desktop/mobile login were visually checked. Independent readonly cleanup finds all 52 Atrium tables identical to the pre-test snapshot and no fixture Storage objects; temporary credentials and the browser container were removed. See portal/deployment/web-app/browser-evidence.json and cleanup-evidence.json. The user was pre-verified: browser invitation/email verification and authenticated account/file persistence across ECS replacement remain open, alongside managed signing, live-secret recovery/rotation and other Phase 2 acceptance.


GrowthCast portal update (2026-09-25): staging login/admin/client views now match the website palette, fonts and supplied wordmark. Requested retained admin and test-client accounts are provisioned; see `portal/deployment/web-app/README.md` and `portal/deployment/review-accounts/verification.json`. Passwords remain only in the protected local configuration directory. Phase 2 email-verification and other remaining acceptance work are unchanged.


Phase 2 update (2026-09-25): authenticated browser session, project and private-file persistence across a full staging ECS task replacement now pass. The original task stopped; the replacement is healthy. Cross-organization denial/logout and independent exact fixture cleanup pass; retained review accounts are untouched. See `portal/deployment/task-persistence/evidence.json` and `cleanup-evidence.json`. Browser email verification and remaining signing/operations acceptance stay open.


Client profile fix (2026-09-25): saving a company name previously sent GET-only user/organization IDs back to the strict PUT DTO, causing HTTP 400. The frontend overlay now sends only the five editable profile fields. Deployed browser create/edit/reload checks pass, identity override validation remains enforced, and independent 52-table cleanup hashes match. See `portal/deployment/profile-save/evidence.json`; the retained review account profile was not altered.


Phase 2 update (2026-09-25): browser admin invitation, new-client signup, actual captured SMTP verification, tampered-token denial and verified client login now pass. Temporary collector/network access and synthetic data are removed; concurrent review-account changes are preserved. See `portal/deployment/browser-invitation/README.md`. Upstream pre-verification portal access remains distinct from later verified document-claim requirements. Managed signing and remaining operational acceptance are still open.


Verified-access update (2026-09-25): deployed API and frontend now require email verification before portal access. Unverified signups receive no session; sign-in and invitation acceptance require verification; old unverified sessions are denied by the shared API guard and redirected by page layouts. Captured-email verification now shows a session-checked confirmation and completes the client invitation. Six focused guard tests, live denial/verification/client-login flows and final service audit pass. See `portal/deployment/verified-access/README.md`. Concurrent review-account/session/project changes were preserved during scoped fixture cleanup.


Google Workspace mail update (2026-09-25): following the operator’s SMTP/alias setup request, staging now sends real application mail using the saved encrypted `ewhite@growthcast.app` SMTP credentials and `clients@growthcast.app` sender. Outbound TLS SMTP 465 is enabled; inbound rules are unchanged. Pre-membership verification uses the GrowthCast sender organization, and synthetic .invalid/.test mail stays captured. Twelve focused tests/builds and non-sending Google TLS/authentication checks from both local and deployed runtime pass. Actual inbox delivery is not yet verified. See `portal/deployment/workspace-mail/README.md` and `cloud-auth-evidence.json`. This supersedes earlier capture-only staging statements.


Stripe settings and favicon update (2026-09-25): corrected the saved-key account lookup that returned account_invalid and silently disabled every payment method. Read-only checks of the production-built helper confirm charges enabled and seven supported active capabilities. Lookup failures now show a retry control; last-selected-method behavior is explained. The supplied JPEG favicon is deployed and byte-verified. All 39 API tests, frontend build, fixture-based desktop/mobile UI checks, failure/retry and scoped cleanup pass. See `portal/deployment/payment-options/README.md`. No Stripe writes or charges were made. Live payment acceptance remains open: the registered webhook currently receives HTTP 401 from protected staging, requiring a separately scoped signature-verified public entry point.


Monthly revenue and single-site settings (2026-09-25): Reports → Monthly revenue now shows client/project rows, monthly and overall revenue/cost/margin totals, bounded by project dates. Budgets support retainer, hourly, and flat fee; flat fees count only in the start month. Hourly revenue uses completed billable hours attached to invoices, including drafts, by work month; actual labor includes all completed time. Missing setup/costs are explicit. Organizations/Billing tabs and Workspace Custom Domain are hidden; hidden settings routes redirect. All 48 API tests, frontend build, managed-schema suite, real desktop/mobile API/browser checks, client denials and exact fixture cleanup pass. Existing budgets remain retainers under additive migration 008. See `portal/deployment/revenue-report/README.md` and its deployment/recovery receipts for current rollout status.
