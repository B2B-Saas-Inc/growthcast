# CLAUDE.md

This file provides persistent context for AI agents working on GrowthCast. Read it fully before writing any code.

## Project overview

GrowthCast is a white-labelled, local-first SaaS forecasting application for operators who need to model acquisition, customers, recurring revenue, and unit economics. Users configure global and per-channel assumptions, compare scenarios, inspect monthly outputs and channel attribution, and exchange versioned assumption sets as JSON or CSV. The current stage is a functioning static MVP deployed on Vercel with no monetization, accounts, or backend.

The primary activation action is changing an assumption or loading an assumption set and seeing the forecast update deterministically.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React, TypeScript, Vite |
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
| Production runtime | Static Vite output on Vercel; nginx container remains the portable local runtime |
| CI/CD and public hosting | Vercel production deployment at `growthcast.app`; no repository CI workflow yet |

## Directory structure

```text
.
├── src/
│   ├── App.tsx                 # UI, local state, import/export, pages
│   ├── styles.css              # Responsive visual system
│   ├── main.tsx                # React entry point
│   └── engine/
│       ├── forecast.ts                 # Pure deterministic forecasting engine
│       ├── forecast.test.ts            # Forecast invariants and regressions
│       ├── channelBreakdown.ts         # Cumulative baseline/channel cohort attribution
│       ├── channelBreakdown.test.ts    # Grouping and reconciliation tests
│       ├── metrics.ts                  # Cash flow, NRR, blended CAC, Magic Number
│       └── metrics.test.ts             # SaaS metric and cash-flow regressions
├── artifacts/                  # Local screenshots; ignored
├── Dockerfile                  # Test/build stage and nginx runtime
├── nginx.conf                  # SPA fallback and portable container server
├── vercel.json                 # Production build, SPA routing, and security headers
├── package.json
├── package-lock.json
├── vite.config.ts
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
```

Formatting, database, email-preview, and worker commands are not configured. Mark new commands in this file when those systems are introduced.

## Architecture: the complete current stack

### Application shell

`src/App.tsx` owns UI state and local persistence orchestration and renders six logical pages: Home, Baseline, Forecast, Deep Dive, Channels, and Methodology. Home is the default landing page and routes users into Baseline. Global reset, import, format, and export controls live in the Tools dropdown immediately after Methodology in the primary navigation. Forecast, Deep Dive, and Channels accept zero-valued B2C and B2B baselines so users can model from an empty or pre-revenue state. New and reset models default the baseline month to the user's current calendar month and the forecast start to the following month. Baseline owns the editable model name and selected model's opening metrics; derived values and B2B rate calibration remain presentation orchestration, while forecast formulas stay in the engines. The Monthly Forecast table is a single-open-row accordion backed by `src/engine/channelBreakdown.ts`: each expanded month groups Baseline / Existing Business, Direct Response, Demand Gen, and Owned / Partner / Custom, showing category subtotals and launched channel rows. Channel customers and MRR are cumulative retained cohorts using the same monthly logo churn, revenue churn, expansion, and downgrade assumptions; category totals reconcile to the parent forecast. `src/engine/metrics.ts` owns cash flow, NRR, blended CAC, and SaaS Magic Number calculations. Persisted and imported models pass through the shared version-aware validator before state setters run. Keep the app white-labelled. The editable model name controls document title and exported filenames and must round-trip through assumption JSON.

### B2C and B2B model contracts

Baseline selects `b2c` or `b2b`; missing `businessModel` values from older saved state migrate to B2C. B2C remains gated on visitors, signups, new customers, total customers, and MRR. B2B is gated on visitors, MQLs, SQLs, new customers, total customers, and ARR; MRR and average monthly revenue per account are derived.

B2B potential closed-won customers equal `visitors × mqlRate × sqlRate × closeRate`; realized monthly wins are rounded to whole accounts. New MRR equals realized closed won × ACV ÷ 12, so it moves in whole monthly-contract increments. Logo churn rounds to whole accounts, and B2B revenue churn rounds to whole monthly-contract increments; movements below one account or one contract produce no loss. `dealCycleDays` shifts SQL-derived closes uniformly across actual calendar months. The latest complete month's B2B baseline MQL, SQL, and new-customer flow calibrates the global MQL, SQL, and close rates. Baseline traffic and every channel use this same pipeline contract, while channels can override MQL, SQL, close, and ACV assumptions. Forecast shows MQLs, SQLs, and closed won over time alongside realized MRR and ARR. Keep all B2B calculations in the engine and channel-attribution modules.

### Homepage

The homepage tells the product story in three sections: Hero, Why it exists, and How to use. Preserve the first-person, practitioner-led voice, the coastline-paradox framing, the five baseline metrics, the marquee growth metrics, and the progression from Baseline to Forecast to Channels. Primary calls to action route to Baseline. Keep it white-labelled and responsive.

### Growth Plan request

A persistent bottom banner rises from its tray 15 seconds after a user changes a Forecast assumption or Channel setting. While visible, its measured responsive height is added to the page's bottom spacing so no content is trapped behind the fixed banner. Navigation does not trigger or cancel it; another qualifying change restarts the timer. It collects first name and email only after explicit submission, calls `posthog.identify(email, { email, first_name })`, and immediately captures `growth_plan_requested` with matching `$set` person properties through `fetch`. This ensures the custom event updates/creates the identified profile even when PostHog suppresses a redundant `$identify` event for an already-known distinct ID. Successful submission is stored locally under `growth-plan-requested-v1`. PostHog browser traffic uses the neutral same-origin `/gcast-io` reverse-proxy path; Vercel rewrites and nginx route US-region API, SDK asset, and remote-config requests to the appropriate PostHog hosts.

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
- Customer churn and revenue churn remain independently editable. Customer churn is realized in whole-customer units. For B2B, revenue churn is realized in whole monthly-contract units (`ACV ÷ 12`), so sub-contract loss produces no movement. Reconcile the realized movements each month through `churnedCustomerArpu = churnMrr ÷ churnedCustomers` and `churnedArpuRatio = churnedCustomerArpu ÷ openingArpu`; expose both in Forecast diagnostics and churn CSV/PDF outputs.
- Channel traffic is introduced once at go-live, then compounds with global Traffic growth. Monthly paid-spend schedules become explicit adjustments to the compounded active cohort rather than replacing engine state.
- Live month `0` excludes the channel from traffic, spend, allocation, customers, and revenue; when a paid channel is changed to 0, redistribute its allocation proportionally across the other enabled paid channels so enabled allocation remains 100%.
- Direct response includes Branded Search, Non-Brand Search, Meta, Reddit, Pinterest, LinkedIn, TikTok, and Snapchat: `visitors = allocatedSpend / CPC`.
- Demand generation: `visitors = allocatedSpend / CPM * 1,000 * CTR`.
- Expected CPC is `allocatedSpend / visitors`.
- Partner assumptions include recurring affiliate commission percentage and commissioned months; defaults are 30% for 12 months. Estimate commission cost using channel ARPU and geometric monthly revenue retention over the commission window.
- Actual blended CAC is enabled paid launch spend plus one month of Sales & Marketing Overhead plus expected partner commissions, divided by new customers predicted from paid and partner launch traffic.
- Predicted contribution LTV is `(total new MRR ÷ total new customers) × grossMargin ÷ effective revenue churn`. This customer-weighted acquisition ARPU includes every active channel's ARPU in proportion to customers acquired; a zero-customer channel has no effect. Never use ending blended ARPU: changing logo churn alone must not change LTV.
- Payback months is blended CAC divided by customer-weighted acquisition ARPU multiplied by gross margin, so channel economics matter without logo churn distorting acquisition payback.
- Expected LTV:CAC is predicted contribution LTV divided by blended CAC. Zero revenue churn makes churn-based LTV, Max CAC, and cost/signup unavailable rather than zero.
- Ending-month NRR is `1 + expansion − downgrade − effective ending-month revenue churn`, including a saved month override.
- SaaS Magic Number is `(latest ending ARR − ending ARR three months earlier) ÷ latest three months of Sales & Marketing spend`. The denominator is the latest three modeled paid-budget months plus three months of `monthlySalesMarketingOverhead` (salaries, commissions, and tools). Do not annualize the numerator with a ×4 multiplier. Show unavailable without four projected months or when denominator spend is zero.
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

PostHog captures product interaction events through a same-origin reverse proxy. The Growth Plan form identifies a person with their submitted first name and email only after explicit submission; model assumptions and financial contents are not attached to that event. Browser console errors must remain zero in validation. Never send secrets, imported assumptions, or financial model contents to analytics.

### Security

The app is static and local-first. Baseline and assumption progress is persisted under versioned local-storage key `growth-model-state-v1`; malformed or unavailable storage must fall back safely. Maintain these controls:

- No credentials, secrets, or live API tokens in the bundle.
- Validate imported files before state mutation.
- Do not execute or inject imported content as HTML or code.
- Keep dependencies pinned through `package-lock.json` and review additions.
- Bind local container examples to `127.0.0.1`.
- Preserve the deployed CSP, HSTS, frame, MIME, referrer, and permissions-policy headers. Keep nginx aligned for all applicable non-TLS protections.
- Never log imported financial assumptions unnecessarily.

### Marketing, SEO, legal, internationalization, notifications, and admin

These systems do not exist in the local MVP. A public deployment must add appropriate metadata, canonical URLs, robots/sitemap policy, privacy and terms documents, consent handling, and deployment ownership. Localization is deferred; keep formatting centralized with `Intl` so future locale support remains possible. Do not add an admin panel or notifications without a backend and explicit requirements.

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

## Environment variables

- `VITE_POSTHOG_KEY`: browser-safe PostHog US project token. Analytics remain disabled when omitted. Production should set this in Vercel project settings; never commit a real value.

Do not create secret-bearing `.env` files. If more variables are introduced, add a secret-free `.env.example`, distinguish server-only from browser-safe values, validate them at startup, and document every variable here.

## Terminology

- **Model name**: User-supplied white-label name stored in assumption JSON.
- **Baseline**: B2C supplies opening visitors, signups, new customers, total customers, and MRR. B2B supplies steady-state visitors, MQLs, SQLs, wins, total customers, and ARR; funnel throughput calibrates the global pipeline rates. Live forecast calculations use baseline visitors, customers, and MRR.
- **Scenario**: Named set of global forecast assumptions.
- **Baseline traffic**: Historical visitor base compounded by global Traffic growth.
- **Channel defaults**: General-tab signup conversion, purchase conversion, and ARPU values applied immediately to every subchannel; individual values may then diverge.
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
