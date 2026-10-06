# GrowthCast

GrowthCast is a GTM Engineering agency site for Series A and later companies with product-market fit. Its free, local-first Forecast tool models acquisition, subscription or ecommerce revenue, and unit economics.

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

**Phase 3 PDF ingestion — 2026-09-26:** candidate upload validation, private immutable registration and guarded reads pass 55 workflow/HTTP checks, ten isolated qpdf/ClamAV checks with controlled signatures, and five real authentication checks. Deployment regressions pass. Worker/feed operations and upload/approval UI remain pending; no Phase 3 changes are live.

**Phase 3 staff screens — 2026-09-26:** candidate document catalog, client/recipient forms and project-linked drafts pass the frontend build and seven real local HTTPS browser checks. Entry is from Overview; sidebar order is unchanged. Upload validation, version/preview/approval, delivery and deployment remain pending. See `portal/guest-documents/README.md`.

**File Library release — 2026-09-25:** deployed and verified on separate staging and production. Upload-only contracts use Uploaded without sending; admin Library originals can be copied into projects; HTML opens in sandboxed modals. The sidebar is Overview, Projects, Calendar, People, Reports, Library, Settings. Admin/client login, live feature checks, and independent backups/restores pass in both environments; synthetic fixtures are removed and normal schedules restored. See `portal/deployment/file-library/README.md`. The separate Phase 3 guest-document candidate remains undeployed.


**Production update — 2026-09-25:** Phase 2 is now deployed at https://clients.growthcast.app with the staging setup migrated into a separate production environment. Staging remains independent. Existing account passwords are unchanged. See the [production release and operations record](portal/deployment/production/README.md). Earlier staging-only and deferred-production statements below are historical; Phase 3 document work remains next.

**Current portal status — 2026-09-25: Phase 2 accepted for staging.** Private repository and CI, deployed persistence, backup/restore, actual staging secret recovery and managed test signing are verified. See [current acceptance](portal/docs/phase-2-acceptance.md). Phase 3 guest documents is next; production trust/capacity/recovery objectives and rollout remain later gates. Earlier progress notes below are historical.

**2026-09-25 — Project settings and email branding are deployed on staging.** Dates, duplicate, archive/unarchive and owner-only deletion are behind the project settings gear; the legacy sidebar rate editor is removed. All 14 automated email templates plus the configuration-test email use GrowthCast typography/colors, with email-client font fallbacks. Thirty-five focused tests and live desktop/mobile action/date checks pass; disposable fixtures are cleaned up. “Not Started” remains the stored project status, independent of dates. See [implementation and evidence](portal/deployment/project-polish/README.md).

**2026-09-25 — Monthly retainer and resource planning is deployed and accepted on staging.** Projects now have an internal Budget & team tab; Reports → Capacity shows member allocations, available capacity and logged utilization. Internal cost rates drive expected/actual cost and gross-margin calculations. The requested $4,000 / $218 / $109 / 15-hour example passes live browser acceptance; client read/write denials, desktop/mobile layout, save/reload, multi-project totals and scoped cleanup pass. The seventh additive migration and updated real backup-to-restore workflow pass. Recurring plans/current project cost rates are used for historical comparisons (no historical rate snapshots). See [implementation and acceptance](portal/deployment/resource-planning/README.md). Document-phase work remains pending.

The [Phase 1 acceptance review](portal/docs/phase-1-acceptance.md) records a local technical pass; self-hosted licensing is resolved by operator confirmation. Client portal work is tracked separately in [portal/README.md](portal/README.md). The initial compatibility spike reproduces a Documenso token/PDF authorization mismatch; the local gateway suite now passes for PIN access, native and SDK signing, revocation and organization isolation, but the full portal is not implemented or deployed. The [Atrium compatibility harness](portal/atrium-spike/README.md) now covers account verification, document tokens and native payments, plus local verified-account handoffs and provider-ownership checks through compiled native controllers; a local Documents catalog and HTTPS handoff now pass desktop/mobile checks with the full AppModule loaded. A combined local runner now connects canonical Documenso completion and cryptographically verified sealed PDFs to the catalog; a restricted local lifecycle worker now uses durable leases and bounded retries. The isolated worker now uses separate SCRAM credentials and signed PDF-verification receipts. Production secret/trust-key management and deployment gates remain outstanding. Portal artifacts are excluded from the public-site Docker context, and both existing private proposals retain their current routes.

Phase 2 now has a local foundation under `portal/foundation/`: pinned local checkouts, versioned baseline migrations, separate database credentials, verified TLS, schema guards and a disposable database/artifact restore drill. Read its README for evidence and remaining gates. The full Atrium AppModule now passes invited signup, captured email verification and session checks with restricted Prisma credentials over verified TLS. Restricted-role claims, catalog HTTP access and gateway-store handoffs now use a scoped canonical-artifact copy function. The combined real-provider/browser gateway now uses a dedicated restricted database identity without owner/lifecycle credentials. The combined Atrium HTTP components now use restricted application clients, reviewed migrations and verified database TLS. The HTTP API now runs in a separate restricted container without fixture-owner, migration, gateway or lifecycle credentials; the driver reads captured mail and side-effect evidence through a read-only volume. The combined API now uses a random mounted auth secret and internal SMTP capture restricted to synthetic recipients. The encrypted recovery drill under `portal/recovery/` restores actual Documenso/gateway fixture databases and four signed PDFs, verifies signatures/hashes/bindings, and rejects tampering and target overwrite. The selected deployment target is Vercel at `clients.growthcast.app` with a new dedicated Supabase PostgreSQL project in B2B SaaS Inc. The RDS proposal is withdrawn and its unexecuted AWS change set has been deleted; supporting AWS services are provisional pending an inventory of the existing Supabase setup. `portal/deployment/` contains tested proxy helpers and a read-only Supabase catalog/connection preflight. The dedicated Supabase project `growthcast-clients-staging` (`saedetvoolpdysiyjwvg`) now exists on Micro in US East. Keychain-backed CLI authentication works. The separate six-migration managed Atrium baseline is now applied to `gc_atrium` in staging, preserving original foundation checksums. The real AppModule, namespace-scoped guard, TLS, restart and restore checks pass locally; live restricted-role guards and permission denials pass, and the temporary migration login is disabled. All six roles remain NOLOGIN. Documenso’s separate managed history (164 pinned upstream migrations, runtime permissions and a versioned restore-stable fingerprint fix) is now applied to `gc_documenso`. Its encrypted local private-schema recovery drill now preserves ownership/ACLs and verifies four signed PDFs, grant bindings, tamper/overwrite denial and resumed service health; off-host operational recovery remains open. The actual restricted provider passes native/SDK signing, four PDF signature checks and gateway boundary/restart/revocation tests locally; live guards and cross-schema/API denials pass. Its temporary migration login is disabled. Only empty `portal_api` is exposed to the Data API. Runtime credentials and deployment remain outstanding. TLS enforcement is enabled; legacy API keys are disabled and the legacy signing key is revoked. See `portal/deployment/supabase-managed-atrium-evidence.json` and `portal/deployment/supabase-managed-documenso-evidence.json` (initial audit/isolation retained separately). A protected Vercel staging project exists; production packaging, staging deployment and managed recovery remain open; see `portal/docs/phase-2-acceptance.md`.

The managed runtime startup wrapper under `portal/deployment/runtime/` now enforces exact application roles, verified TLS, private namespaces and read-only schema guards before child launch. Its seven containerized boundary tests pass. The pinned Documenso package now passes actual provider/Prisma startup over TLS/SCRAM, restart, drift refusal and repaired restart in an isolated disposable database. The packaged provider also passes native/SDK signing, four PDF signatures, restart, 588 route-boundary denials, expiry and revocation. A production-dependency Atrium API package now runs the actual upstream main/AppModule and passes TLS/SCRAM startup, private-route and uninvited-signup denials, restart and schema-drift refusal. The packaged API also passes invited signup, internal SMTP verification, invitation acceptance, organization isolation, restart-persistent sessions, logout/replay denial and existing-account login. A checksum-guarded staging mail patch permits only synthetic recipients. Private origin-proof ingress and named-volume artifact persistence now pass direct-access, cross-project/organization, membership-removal and container-recreation checks; the local storage prefix traversal check is fixed. Private Supabase bucket `gc-atrium-private` and a dedicated storage service identity are now provisioned; the compiled REST adapter passes live byte-exact upload/download/delete, overwrite, anonymous, other-identity and cross-bucket denials. Legacy keys stay disabled and the six database roles remain NOLOGIN. The complete packaged API now passes live managed-storage upload/download, container recreation and membership-revocation checks; exact-object cleanup and an independent empty-bucket inventory pass. Independent backup/recovery, portal adapters and scoped live database credentials remain outstanding.


A dedicated encrypted S3 archive destination now exists under `portal/deployment/offhost/`. Its scoped upload/restore sessions and exact-version round trip pass; the downloaded archive restores both synthetic provider/gateway databases and four signed PDFs with ownership, grants, signatures and tamper/overwrite checks. Archive data keys are now wrapped by a retained, annually rotated AWS KMS key; restricted-role recovery and migration of all four retained legacy keys pass, with no persistent local plaintext archive keys. The live Supabase staging snapshot now passes off-host restore into isolated local targets: 107 tables, 223 rows and one synthetic private-storage object, with matching data, owners/effective ACLs, both schema guards, access denials and verified source cleanup. See `portal/deployment/managed-recovery/`. Replacement-project/bucket recovery, scheduled backups, runtime secret distribution and deployment remain open. See `portal/deployment/offhost/kms-evidence.json`; the documented schedule is not enabled.

The dedicated `gc_backup` read-only login now passes TLS, both guards, permission denials and the complete 107-table/223-row off-host restore. Its connection is in Secrets Manager; an ECS-only backup task role passes twelve policy simulations. The six application/migration roles remain NOLOGIN. The separate Storage reader and digest-pinned ECS backup job now pass live one-off execution and independent recovery; daily staging backup/restore orchestration is enabled at 06:00 UTC. Hourly independent monitoring is enabled; notification routes are enabled for the confirmed recipient; SNS accepted the labeled delivery test, with inbox receipt confirmed by the operator. See `portal/deployment/backup/README.md`.


The application has no accounts or application database. It runs primarily as a static site, with one bounded `/api/lead` serverless endpoint for validated agency lead capture, and automatically persists the model name, baseline, global assumptions, channel defaults, budget, and channel configuration in browser local storage so progress survives reloads. JSON and CSV exports remain available for sharing and backup. PostHog provides product analytics and receives contact details only when a user explicitly submits a contact or Growth Plan form.

Astro owns the static routes, metadata, blog, RSS feed, and sitemap. The agency and Forecast experience is rendered as a React island so its existing local-first state and export workflows remain interactive without turning the blog into a client-side application.

## Features

### Agency homepage

Marketing and blog footers display `Copyright {year} B2B SaaS Inc. DBA GrowthCast`, with the year computed at render time (build time for static blog pages).

The default route presents GrowthCast as **GTM Engineering for Growth**. It targets founders, CEOs, VC partners, and private-equity partners at Series A and later companies that have traction but need a repeatable growth system. Its full-width hero leads into the AAARRR operating view, Current Demand / Future Demand, anonymized directional proof, fit, and the Forecast resource. Proof language must be checked for scope, attribution, evidence, and publication permission before final copy.

Agency contact requests POST an allowlisted lead payload to `/api/lead`. The server validates controlled values, consent, email, website, and start date; assigns a UUID-based submission ID; and captures one `lead_form_submitted` event in PostHog. Browser code never calls Attio or receives the PostHog server configuration. The dialog reports an actionable error instead of claiming success when delivery is unavailable or the browser is offline, and it supports focus containment, Escape dismissal, and focus restoration.

**Why GrowthCast** at `/why-growthcast` explains the cross-functional growth problem and GTM Engineering point of view. **How We Work** at `/how-it-works` focuses on the four engagement stages and client operating changes rather than repeating the homepage. The agency header links to both pages, **Service Lines**, and **Resources > Tools > Forecast**. The Forecast tool is available at `/resources/tools/forecast`; direct visits and browser history preserve the agency/tool boundary. The Forecast tool uses the same main navigation as the agency site: Why GrowthCast, How We Work, Service Lines, Company, Resources, and Let's Talk Growth. Its page title has no separate wordmark; Baseline, Forecast, Deep Dive, Channels, Methodology, and Tools remain in a labeled secondary navigation. Agency links load the corresponding static pages, and the contact link opens the agency's contact flow. Reset, assumption import/export, forecast format, and forecast export controls live in the **Tools** dropdown beside Methodology.

### Services

`/services` is the service index. Eleven static pages live under `/services/`: `gtm-engineering`, `paid-media-management`, `seo-aeo`, `analytics-reporting`, `crm-revenue-ops`, `marketing-ops`, `lifecycle-marketing`, `content-marketing`, `strategy`, `ai-enablement`, and `fractional-growth-leadership`. Paid-media channels and podcast/newsletter offerings are sections within their parent service pages. Each page includes scope, deliverables, measurement, related services, and the existing `/?contact=1` contact entry point.

`src/services.ts` holds the shared copy and route slugs; Astro renders the index and detail template with unique metadata, canonical URLs, Service/BreadcrumbList schema, and automatic sitemap inclusion. Service pages reuse the static blog navigation shell. The Service Lines dropdown in the agency, Forecast, and blog navigation links to the index and all eleven service pages. All public page headers include Client Login at `https://clients.growthcast.app/login`.

### Baseline setup

The editable model name lives with the baseline inputs. GrowthCast is the default identity, while changing the model name updates the document title and export filenames. New and reset models default the baseline to the current calendar month and begin the forecast in the following month.

The first tab defines the opening state and lets the user choose a B2C, B2B, or D2C / Ecommerce model. D2C models first purchases and repeat orders with its own commerce assumptions, metrics, charts, and exports; see the D2C section below. B2C preserves the visitor → signup → purchase workflow: users enter baseline month, visitors, signups, new customers, total customers, and MRR; ARPU and ARR are derived automatically. B2B uses the latest complete month's steady-state pipeline flow with visitors, MQLs, SQLs, new customers, total customers, and ARR. Each funnel stage must be no larger than the preceding stage. The observed MQL, SQL, and closed-won throughput calibrates the three pipeline conversion rates; the average deal cycle controls when forecast SQL cohorts close. MRR and average monthly revenue per account are derived automatically. The page can upload or export baseline CSV files and also load a complete assumptions JSON/CSV.

The application starts with zeroed metrics and contains no bundled private historical performance. Forecast, Deep Dive, and Channels remain available when baseline metrics are zero, so users can model from a pre-revenue or empty starting state. Master Reset returns to B2C Baseline and clears the model. Baseline files include the selected business model and paid-media budget.

### Forecast

- Editable model name used in the document title and exported filenames
- Conservative, Baseline, and Ambitious scenario presets for B2C; B2B uses its explicit pipeline and annual retention assumptions without preset buttons
- Starting-month selector covering August 2026 through August 2028
- Adjustable forecast range, traffic growth, visitor-to-signup conversion, signup-to-purchase conversion, and average days from signup to upgrade
- B2B pipeline assumptions for visitor-to-MQL, MQL-to-SQL, SQL-to-closed-won, average deal cycle in days, and ACV. Closed-won customers and new MRR are delayed with actual calendar-month lengths; `new MRR = closed won × ACV ÷ 12`
- A B2B pipeline-over-time chart for MQLs, SQLs, and closed-won customers alongside the combined MRR/ARR trajectory and revenue bridge. B2B wins occur in whole-account units. B2B has no separate revenue-churn assumption: voluntary and delinquent logo churn are annual percentages applied once every 12 forecast months, with churned accounts rounded from opening customers and lost MRR equal to churned accounts × ACV ÷ 12
- Expandable churn, expansion, downgrade, ARPU, margin, LTV:CAC, and Sales & Marketing Overhead assumptions. B2C overhead and retention rates are monthly. B2B overhead is annual; logo churn, expansion, and downgrade are annual and apply once every 12 forecast months
- Ending MRR, ending ARR, total customers, maximum CAC, and maximum cost per signup
- Second metric row for payback period, predicted LTV, actual blended paid CAC, and expected LTV:CAC. B2C predicted LTV uses customer-weighted acquisition ARPU, gross margin, and revenue churn. B2B predicted LTV is `(ACV × gross margin) ÷ annual logo churn`; B2B payback is `blended CAC ÷ ((ACV ÷ 12) × gross margin)`. B2B blended CAC divides annual overhead, the first 12 forecast months of paid spend, and affiliate commissions by all customers acquired in those 12 months
- MRR trajectory, monthly revenue bridge, and customer-growth visualizations
- Expandable monthly forecast table with visitors, signups, new customers, total customers, ARPU, MRR, ARR, and acquisition thresholds. Clicking a month reveals reconciled cumulative cohort rows grouped under Baseline / Existing Business, Direct Response, Demand Gen, and Owned / Partner / Custom; launched channels retain customers and MRR through the applicable B2C monthly churn or B2B annual logo-churn event plus expansion and downgrade assumptions; disabled and pre-launch channels remain absent
- Whole-number people counts plus whole-dollar ARPU, Ending MRR, Ending ARR, Max CAC, and Max cost/signup on the main Forecast page
- Signup conversions are delayed by **Days to upgrade**. Signups are assumed to arrive evenly through each calendar month; only the share old enough to upgrade contributes customers and MRR in that month, while the remainder rolls into subsequent months. The current trailing-30-day Mixpanel average is 3.0 days (measured July 12–August 10, 2026 from `User Signup` to `Plan Upgraded`, within 90 days)
- A churn-value diagnostic showing implied churned-customer ARPU (`churned MRR ÷ churned customers`) and its ratio to opening ARPU, making the relationship between independently editable logo and revenue churn explicit
- Ten marquee metrics, including NRR (`1 + expansion − downgrade − revenue churn`) and SaaS Magic Number (`[latest ending ARR − ending ARR three months earlier] ÷ latest three months of Sales & Marketing Spend`). Spend includes paid media plus three months of salaries, commissions, and tools overhead; no additional annualization multiplier is applied
- Forecast export as a model-named ZIP containing `forecast.csv`, `budget-breakdown.csv`, `churn-overview.csv`, `mrr-overview.csv`, `growth-rate.csv`, `customers-overview.csv`, and `cash-flow.csv`; B2B forecast rows use `mqls`, `sqls`, and `maxCostPerMql` instead of B2C-only signup fields. A shareable PDF report contains summary metrics, assumptions, the monthly forecast, all applicable main charts (including B2B pipeline), all six Deep Dive charts, and dedicated Deep Dive tables
- One-click PNG export for every Forecast and Deep Dive chart at exactly 1230 × 600 pixels, with GrowthCast title/description typography and the current rendered chart fitted to the canvas; plus a designed 1200 × 1200 export containing all ten marquee metrics

### Growth Plan request

Fifteen seconds after a user changes a Forecast assumption or Channel setting, a persistent banner rises from a tray at the bottom and offers a personalized Growth Plan. The page adds space equal to the responsive banner height so content remains scrollable above it rather than being covered. Users can close the banner explicitly; after a successful submission, their next scroll also slides it back into its bottom tray. Submitting a first name and email identifies or creates the person in PostHog and immediately sends the `growth_plan_requested` event through the first-party proxy. The event also carries PostHog `$set` person properties so profile creation does not depend solely on a separate `$identify` request. The current model snapshots are attached only to the event as nested JSON properties named `baseline` and `assumptions`; they are not stored as person properties. A successful request is remembered in local storage so the panel is not shown again in that browser.

### Methodology

A dedicated Methodology page documents the monthly calculation sequence, channel activation rules, paid-traffic formulas, customer and revenue bridges, unit economics, SaaS metrics, cumulative channel attribution, and recommended workflow.

### Blog

The Astro-native blog lives at `/blog`. Posts are typed Markdown or MDX files in `src/content/blog`, with validated title, description, publication dates, author, tags, draft state, featured state, and optional social image. Astro generates static article routes, search/filter views, article metadata and JSON-LD, an RSS feed at `/rss.xml`, and a sitemap index at `/sitemap-index.xml`. Blog pages share the agency site's full Company/Resources navigation and contact entry point, use GrowthCast's local Manrope and DM Mono fonts, and retain its neutral, green, blue, and coral design language. Article pages preserve the MediaMixModel reference UX: a title-and-cover hero, breadcrumb and back navigation, author/read-time metadata, and a boxed sticky table-of-contents/share rail that stacks on mobile.

Writers must follow `docs/editorial/human-first-writing.md` for every draft and edit. The pinned shared content engine validates article contracts and the GrowthCast profile without requiring superficial token patterns. The production build also validates each rendered, publishable article’s title, description, canonical URL, author, publication and modification dates, indexability, and `BlogPosting` JSON-LD.

### Deep Dive

A dedicated tab immediately after Forecast provides six forecast-driven analytical views, each with a chart and monthly breakdown table:

- Budget breakdown by paid subchannel, including go-live timing and monthly totals. The headline monthly budget is editable, and any channel point can be dragged vertically to override spend for that month.
- Churn overview with voluntary/delinquent revenue and customer churn. Revenue-churn points can be dragged vertically to override a specific month.
- MRR overview with new, expansion, downgrade, churn, ending MRR, and ARR
- Growth rate with net-new MRR and month-over-month growth
- Customers overview with new customers, voluntary/delinquent churn, and ending customers
- Cash flow with editable fee and refund percentages, a monthly/annual plan split, and optional one-time payments as a third split component. Monthly subscription cash uses ending MRR × monthly share; annual and one-time cash use new MRR × their share × 12; fees and refunds reduce gross cash.

Editable Budget and Churn charts each include a local reset and an optional toggle that applies a point edit through every future month. An Advanced budget controls disclosure contains the optional compounded monthly increase, isolated total-budget change, forward step change, and subchannel spend editor, keeping the default Budget view focused on the chart. Dragging one subchannel’s budget point moves spend in $100 increments, proportionally redistributes the remainder across other enabled paid channels, keeps each affected monthly total fixed, and immediately updates the table. Churn dragging snaps to 0.1 percentage-point increments. Equivalent labeled month/channel/rate inputs support keyboard and assistive-technology editing without dragging. Chart lines can be shown or hidden independently on each Deep Dive tab. Mixed movement/total or monetary/rate charts use independent left and right axes with zero aligned at 80% of the plot height, keeping signed bars close to the X-axis and the larger whitespace area above the data. Tooltips show monetary values with currency prefixes and two decimal places. Monthly budget and churn overrides immediately recalculate that month and all subsequent forecast balances; they persist locally, round-trip through assumption exports, and appear in exported PDF Deep Dive pages. Churn tables and CSV/PDF exports include churned-customer ARPU and its ratio to opening ARPU. Churn, downgrade, and other loss bars render below the X-axis as negative values, while New and Expansion remain visible above it; all movement bars align on the same monthly position rather than staggering. Visitors, signups, new customers, churned customers, and ending customers are emitted and displayed as whole people. Customer charts use the right axis for new-customer movement.

### Channel settings

A separate page keeps channel configuration out of the main forecast. Channel names, labels, values, and tabs use a high-legibility treatment.

New and reset models start with **no channels**. Open a category's **Browse channel library**, search by tactic/platform/use case or filter by group, and add only the channels you need. The library contains 65 editable presets:

- **General:** Set B2C conversion and ARPU defaults or B2B MQL, SQL, close-rate, and ACV defaults across existing channels and future additions; individual channels can still override them afterward.
- **Direct Response (20):** Brand, non-brand, competitor, Bing, shopping, Performance Max, and app search; major paid-social platforms; retargeting, native ads, review sites, marketplaces, and a custom CPC tactic.
- **Demand Gen (16):** Video, connected TV, streaming, social awareness, display, native sponsorships, podcasts, streaming audio, newsletter and creator sponsorships, digital out-of-home, and a custom CPM/CTR tactic.
- **Owned / Partner / Custom (29):** SEO, content, AI search, organic social/video, communities, email and product-led acquisition, affiliates, co-marketing, integrations, referrals, events, PR, outbound, sales-led acquisition, and custom traffic. Partners retains editable affiliate commission defaults of 30% for 12 months.

Library values are **illustrative USD planning assumptions, not performance benchmarks**. Paid presets supply CPC or CPM/CTR inputs. For non-clickable media, CTR represents an estimated exposure-to-site response rate, not modeled view-through lift. Owned presets supply incremental launch visitors, not impressions or contacts; account for non-media costs through the existing Sales & Marketing Overhead input on Forecast. Lifecycle tactics represent acquisition traffic, not a new retention model. Avoid double-counting visitors already included in the baseline.

New channels launch in month 1 and inherit the General funnel defaults. A paid addition receives only the remaining unallocated budget, or 0% if the budget is already fully allocated; existing allocations are never changed by adding a tactic. Review and split allocations after adding channels. Owned channels receive no paid allocation. Existing saved/imported lists retain their membership, order, and edited assumptions; loading them never inserts library tactics. The schema remains version 3, with versions 1 and 2 still supported.

Every channel supports:

- Go-live month; `0` disables the channel completely and proportionally redistributes its paid allocation across the remaining enabled paid channels
- Hide, show, and restore controls; hiding affects only list visibility, not forecast participation. Library entries already in the plan cannot be duplicated, and restoring a hidden entry preserves its edits and activation state.
- Remove control inside the expanded editor; removal clears that channel's monthly spend overrides and leaves its allocation unassigned without changing other channels. Re-adding uses library defaults, not the removed edits.
- Expandable B2C or B2B funnel assumptions, with responsive channel editors on mobile

Paid media defaults to a $0 monthly budget and uses editable subchannel allocations. Dollar allocations and expected traffic are calculated automatically:

```text
Direct-response visitors = allocated spend / CPC
Demand-generation visitors = allocated spend / CPM * 1,000 * CTR
Expected CPC = allocated spend / calculated visitors
Affiliate CAC/customer = ARPU × commission % × churn-adjusted commissioned months
```

Channel traffic enters the model once in its go-live month. From then on, active traffic compounds through global Traffic growth. Monthly spend schedules are translated into explicit adjustments to that compounded cohort, so growth and step edits do not silently replace prior traffic state. Disabled and pre-launch channels always contribute zero, even if stale overrides exist.

### Portable assumption sets

Choose JSON or CSV and export a versioned assumption file containing:

- Model name
- Baseline metrics
- Scenario
- Global assumptions
- Paid-media budget
- Every channel and subchannel setting
- Visibility and activation configuration

Loading either JSON or the exported CSV restores the model name, baseline metrics, starting month, and all assumptions. Files are size-limited, parsed, and validated locally before application state changes. Spreadsheet exports neutralize formula-like user text.

## Calibration and privacy

Private historical exports from August 2024 through July 2026 were used during model calibration but are not bundled in the repository or production application. Current Baseline assumptions include:

- Visitor-to-signup: 13.7%, weighted over the trailing six complete months
- Signup-to-purchase: 0.8%
- Starting paid-media budget: $0/month

The deployed app contains no raw Mixpanel or billing-system history and no credentials.

## Run locally

### Requirements

- Docker with BuildKit support
- A modern browser

### Build and run

```bash
docker build -t growth-model .
docker run --rm -p 127.0.0.1:8080:8080 growth-model
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) for the agency site or [http://127.0.0.1:8080/resources/tools/forecast](http://127.0.0.1:8080/resources/tools/forecast) for the Forecast tool.

Binding to `127.0.0.1` keeps the app local to your machine.

## Development

The repository follows a container-first workflow. The Docker build installs dependencies inside the image and runs all required checks:

1. ESLint
2. Vitest
3. TypeScript project build
4. Astro static production build

Package scripts available inside a Node container are:

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

### Durable local content state

Operator content automation uses the shared `AtomicFileQueueRepository` at ignored `.content-runs/queue/queue-v1.json`. Atomic lock-and-rename persistence makes queue commits durable and process-safe on one shared filesystem. Scheduled publishing loads only `.content-runs/publication-bundles/<slug>.json` records, then independently validates passing QA, accountable exact article-plus-assets approval, and artifact hashes before a deploy hook can be accessed. Missing or malformed local state fails closed.

### Research-to-draft generation

The operator-only shared generation pipeline reads an approved brief contract, researches through OpenRouter with retrievable URL citations, runs draft and edit stages, applies deterministic QA, and writes resumable checkpoints plus review artifacts under ignored `artifacts/content-generation/`. Configure only `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`; optional endpoint and retry settings are documented in `.env.example`. The CLI does not load dotenv files.

```bash
# Review mode (safe default)
npm run content:generate -- <approved-brief-id> --run-id <stable-run-id>

# Isolated full visual shadow bundle; never writes source, uploads, databases, deploy hooks, indexes, or publication
npm run content:generate -- <approved-brief-id> --shadow --run-id <stable-run-id>

# Deliberately create a new, non-publishable Astro draft
npm run content:generate -- <approved-brief-id> --write-to-src --run-id <stable-run-id>

# Validate a separately supplied human approval for the exact generated hash
npm run content:generate -- <approved-brief-id> --approval-file <approval.json> --run-id <stable-run-id>
```

Default and shadow modes write no source content. `--write-to-src` uses exclusive creation, refuses to overwrite, and always emits `draft: true`. An approval file must satisfy the shared article-approval contract and match the generated canonical SHA-256 exactly; the command never creates approval or human observations. Shadow generation runs research/evidence, prose, contextual visual planning, Google `gemini-3-pro-image` inline illustration, certified deterministic hero/thumbnail, exact-title Manrope/logo OG, visual QA, manifest, and an approval-null publication bundle in deterministic order. Reusing the same run ID resumes hash-matching checkpoints and assets; changed or tampered inputs fail closed or regenerate only the invalid asset. Generation never publishes, uploads, writes a database, calls Sanity or a deploy hook, indexes, schedules content, or performs any remote write other than the explicitly configured generation provider requests. Reuse the same run ID to resume matching checkpoints; use a new run ID when the approved brief changes.

For UI changes, validate the running production image with Playwright at desktop and mobile widths. The responsive layout stacks forecast cards, wraps navigation/actions, adapts Deep Dive controls, and keeps large tables horizontally scrollable on narrow screens.

At mobile widths, agency navigation remains fully available in a touch-sized grid, marketing sections use reduced type and spacing, dense forecast controls stack, and charts preserve readable axes through contained horizontal scrolling. Contact and Growth Plan overlays use dynamic viewport limits and safe-area padding.

## Architecture

```text
src/
├── AgencyApp.tsx           Lightweight agency island and server-routed contact flow
├── App.tsx                 Forecast island, state, and exports
├── channels.ts             Channel types, legacy normalization, and 65 library presets
├── channels.test.ts        Library, allocation, and saved-model regression tests
├── components/             Astro shell and React island entry points
├── content/blog/           Typed Markdown/MDX blog posts
├── layouts/                Shared Astro metadata and document shell
├── pages/                  Static routes, blog pages, and RSS endpoint
├── styles.css              Forecast and agency visual system
├── blog.css                GrowthCast blog visual system
├── posthog.ts              Browser analytics configuration
├── server/lead.ts          Governed lead validation and envelope contract
api/lead.ts                 Vercel serverless PostHog lead-capture endpoint
└── engine/
    ├── forecast.ts         Pure deterministic monthly model
    ├── forecast.test.ts    Forecast invariants and regression tests
    ├── channelBreakdown.ts Reconciled cumulative channel attribution
    ├── channelBreakdown.test.ts Attribution grouping and reconciliation tests
    ├── metrics.ts          Cash flow, NRR, blended CAC, and Magic Number
    └── metrics.test.ts     SaaS metric and cash-flow regression tests
```

The React layer owns presentation and transient state. Forecast formulas, including calendar-aware signup-to-upgrade lag allocation, belong in `src/engine/forecast.ts`; cumulative baseline/channel cohort attribution belongs in `src/engine/channelBreakdown.ts`; SaaS and cash-flow metrics belong in `src/engine/metrics.ts`. All remain deterministic and independently testable.

See [`AGENTS.md`](AGENTS.md) for concise contribution rules and [`CLAUDE.md`](CLAUDE.md) for complete architecture context.

## Assumption JSON compatibility

Exports use `schemaVersion: 3`; versions 1 and 2 remain import-compatible and migrate to B2C with default B2B pipeline fields available if the user switches models. Import and local-state loading share a version-aware validator. It rejects unsupported versions, malformed baselines, incomplete or out-of-range assumptions, duplicate/invalid channels, invalid override maps, invalid cash splits, negative values, and non-finite numbers before applying state.

## Social image

The 1200 × 630 Open Graph image is `public/growthcast-og.png`. Its editable p5.js source is `scripts/generate-og-image.html`; serve the repository root, open the generator, and press `S` to export a replacement PNG.

Blog artwork uses a two-stage p5.js workflow. `scripts/generate-blog-shape.html` creates the article-specific abstract artwork, and `scripts/generate-blog-social.html` places that artwork into a reusable 1200 × 630 safe-zone template with the article title, author, and publication date. Store both generated files under `public/blog`; set the standalone shape as the post's `artwork` frontmatter value for the article hero, and set the finished social card as `image` for Open Graph metadata and `/blog` cards. Never render the composed social card inside the article.

## Privacy and security

- No authentication or external API credentials
- No server-side persistence; model progress is stored only in the current browser's local storage
- No automatic upload of assumptions or forecast data
- Reload-safe progress stored locally under the versioned browser key `growth-model-state-v1`
- Imported JSON is treated as data, not HTML or executable code
- Local container examples bind only to localhost
- `.env` files, build output, dependencies, screenshots, and `CONTINUITY.md` are excluded from Git

## Deployment

[`vercel.json`](vercel.json) configures Vercel to install with `npm ci`, run the verified Astro build, serve `dist`, preserve the PostHog proxy, and apply HSTS, frame, MIME, referrer, and permissions-policy security headers. Astro generates a per-page hash-based CSP that permits its hydration scripts and the Vercel Toolbar's narrowly scoped origins without weakening the default script policy. The nginx image serves Astro's generated directory routes and mirrors all applicable non-TLS headers. The production project is `b2b-saas/growth-model` at <https://growthcast.app>.

Production builds submit every canonical URL in Astro's generated sitemap to IndexNow after the static generation. Ownership is verified by the root-level public key file. Preview and local builds skip submission; use `INDEXNOW_SUBMIT=true npm run indexnow` for an intentional manual submission or add `INDEXNOW_DRY_RUN=true` to inspect it without contacting IndexNow. Submission service outages are reported without blocking an otherwise valid deployment.

Future-dated blog posts remain absent from routes, RSS, and the sitemap until their `publishedAt` timestamp. `.github/workflows/publish-scheduled-blog.yml` checks for due posts every 15 minutes during the configured publishing windows. For each due URL that still returns 404, repository-owned preflight regenerates shared QA and requires a human approval record at `docs/content-approvals/<slug>.json` whose `content_sha256` exactly matches the canonical article hash. Any QA, GrowthCast-profile, missing-approval, or hash failure stops the job before hook invocation. Configure the hook only as the `VERCEL_DEPLOY_HOOK_URL` GitHub Actions secret; it is never passed to the shared engine. Use `npm run content:schedule:dry-run` to exercise scheduling without invoking it.

```bash
vercel link --project growth-model --scope b2b-saas --yes
vercel deploy --prod --yes
```

Public-deployment follow-ups are monitoring, formal privacy/legal pages, and a documented rollback owner.

## Limitations

- Calibration assumptions originated from private historical exports that are not bundled with the application.
- Channel CPC, CPM, CTR, allocation, timing, and conversion values are planning assumptions rather than guaranteed performance.
- The current application is single-user and browser-local; progress persists in local storage but does not sync across browsers or devices.
- There is no hosted collaboration, database, authentication, or automatic source-data refresh.
- The large interactive Forecast island currently emits a non-blocking client-chunk size warning during the Astro build.

## License

Licensed under the terms in [`LICENSE`](LICENSE).

## Forecast Growth Plan requests

`/api/growth-plan` validates bounded JSON requests and sends `growth_plan_requested` server-side to PostHog, never directly to Attio. The browser redirects to `https://cal.com/growthcast/growth-plan-review` only after HTTP 202, preserving the form on failure. Submissions include explicit marketing disclosure version, identity, submission UUID, and `forecast_json` (baseline and assumptions). The UUID is reused for in-page retries; downstream consumers must independently deduplicate. Forecast JSON is restricted request data, not a general dashboard property.

CRM routing must match/create People and business-domain Companies, never Deals; assign operator review without an SLA. The existing PostHog destination mapping must be reviewed/tested before rollout: JSON download in Attio, booking callbacks, and CRM outcomes are not verified by endpoint tests. A redirect is not a confirmed booking. No automatic plan delivery is implemented.

## Private client proposal routes

`/clients/proposals/bluealpha` and `/clients/proposals/photoshelter` are explicitly requested exceptions to the otherwise unauthenticated static site. Their isolated Vercel functions validate PINs on the server and issue separate eight-hour signed, Secure, HttpOnly, SameSite=Strict cookies. Responses are no-store/noindex, absent from the public sitemap and analytics, and protected even when the API functions are addressed directly. BlueAlpha uses an eight-digit PIN and protects HTML plus PDF; PhotoShelter uses a four-digit PIN and protects its supplied HTML proposal.

Set server-only `BLUEALPHA_PIN_SHA256`, `BLUEALPHA_SESSION_SECRET`, and `BLUEALPHA_CONTENT_KEY` for BlueAlpha. Set `PHOTOSHELTER_PIN_SHA256`, `PHOTOSHELTER_SESSION_SECRET`, and `PHOTOSHELTER_CONTENT_KEY` for PhotoShelter. PIN hashes are lowercase SHA-256, session secrets contain at least 32 random bytes, and content keys are 32-byte lowercase hex. Configure Preview and Production independently. Rotating a PIN hash or session secret revokes that proposal's sessions. PINs and decryption keys must never be committed or embedded in client responses. Each function has a bounded per-instance failed-attempt limiter; it is not a distributed rate limit.

Proposal bundles are gzip-compressed and encrypted with AES-256-GCM under `server-assets/*.enc`. Functions decrypt only after session validation. Encrypted bundles may be tracked for repeatable deployments; plaintext client material and PINs must never be committed or put in `public/` or `dist/`. Vercel includes each encrypted file only in its matching function bundle. Static nginx does not serve these Vercel-only routes. Updating content requires re-encryption and deployment; changing a content key requires re-encryption. Automated API tests cover anonymous/direct access, incorrect PINs, session expiry/tampering, CSRF, logout, missing configuration, and per-instance throttling.


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


Phase 2 update (2026-09-25): browser admin invitation, new-client signup, actual captured SMTP verification, tampered-token denial and verified client login now pass. Temporary collector/network access and synthetic data are removed; concurrent review-account changes are preserved. See `portal/deployment/browser-invitation/README.md`. Upstream pre-verification portal access remains distinct from later verified document-claim requirements. Managed signing and remaining operational acceptance are still open.


Verified-access update (2026-09-25): deployed API and frontend now require email verification before portal access. Unverified signups receive no session; sign-in and invitation acceptance require verification; old unverified sessions are denied by the shared API guard and redirected by page layouts. Captured-email verification now shows a session-checked confirmation and completes the client invitation. Six focused guard tests, live denial/verification/client-login flows and final service audit pass. See `portal/deployment/verified-access/README.md`. Concurrent review-account/session/project changes were preserved during scoped fixture cleanup.


Google Workspace mail update (2026-09-25): following the operator’s SMTP/alias setup request, staging now sends real application mail using the saved encrypted `ewhite@growthcast.app` SMTP credentials and `clients@growthcast.app` sender. Outbound TLS SMTP 465 is enabled; inbound rules are unchanged. Pre-membership verification uses the GrowthCast sender organization, and synthetic .invalid/.test mail stays captured. Twelve focused tests/builds and non-sending Google TLS/authentication checks from both local and deployed runtime pass. Actual inbox delivery is not yet verified. See `portal/deployment/workspace-mail/README.md` and `cloud-auth-evidence.json`. This supersedes earlier capture-only staging statements.


Stripe settings and favicon update (2026-09-25): corrected the saved-key account lookup that returned account_invalid and silently disabled every payment method. Read-only checks of the production-built helper confirm charges enabled and seven supported active capabilities. Lookup failures now show a retry control; last-selected-method behavior is explained. The supplied JPEG favicon is deployed and byte-verified. All 39 API tests, frontend build, fixture-based desktop/mobile UI checks, failure/retry and scoped cleanup pass. See `portal/deployment/payment-options/README.md`. No Stripe writes or charges were made. Live payment acceptance remains open: the registered webhook currently receives HTTP 401 from protected staging, requiring a separately scoped signature-verified public entry point.


Monthly revenue and single-site settings (2026-09-25): Reports → Monthly revenue now shows client/project rows, monthly and overall revenue/cost/margin totals, bounded by project dates. Budgets support retainer, hourly, and flat fee; flat fees count only in the start month. Hourly revenue uses completed billable hours attached to invoices, including drafts, by work month; actual labor includes all completed time. Missing setup/costs are explicit. Organizations/Billing tabs and Workspace Custom Domain are hidden; hidden settings routes redirect. All 48 API tests, frontend build, managed-schema suite, real desktop/mobile API/browser checks, client denials and exact fixture cleanup pass. Existing budgets remain retainers under additive migration 008. See `portal/deployment/revenue-report/README.md` and its deployment/recovery receipts for current rollout status.
