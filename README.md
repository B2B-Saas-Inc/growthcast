# GrowthCast

A white-labelled, local-first SaaS growth and recurring-revenue forecasting application. Configure acquisition channels, funnel conversion, customer and revenue churn, expansion, ARPU, margin, and LTV:CAC targets; then inspect the monthly effect on customers, MRR, ARR, and allowable acquisition cost.

The application has no backend, accounts, credentials, or live API dependency. It runs as a static site and automatically persists the model name, baseline, global assumptions, channel defaults, budget, and channel configuration in browser local storage so progress survives reloads. JSON and CSV exports remain available for sharing and backup.

## Features

### Homepage

The default landing page introduces the model through a Hero, the decade of growth-leadership experience behind it, and a practical How to use walkthrough. It explains the five baseline inputs, the headline growth metrics, and the move from forecast assumptions into channel planning, with direct calls to start the Baseline. Reset, assumption import/export, forecast format, and forecast export controls live in the **Tools** dropdown beside Methodology.

### Baseline setup

The editable model name lives with the baseline inputs. GrowthCast is the default identity, while changing the model name updates the document title and export filenames.


The first tab defines the opening state for the model instead of requiring the bundled project data. Users can enter baseline month, visitors, signups, new customers, total customers, and MRR; ARPU and ARR are derived automatically. The page can upload or export baseline CSV files and also load a complete assumptions JSON/CSV.

The application starts with zeroed metrics and contains no bundled private historical performance. Forecast, Deep Dive, and Channels redirect to Baseline until all five required baseline metrics are greater than zero, and the Baseline page explains what is missing. Master Reset returns to the Baseline tab and clears the model. Enter or import an authorized baseline before using the forecast. A local `baseline.csv` may contain private values for convenient reloading, but it is intentionally excluded from Git and Docker images. Baseline files include the paid-media budget; the authorized local file sets it to $0.

### Forecast

- Editable model name used in the document title and exported filenames
- Conservative, Baseline, and Ambitious scenario presets
- Starting-month selector covering August 2026 through August 2028
- Adjustable forecast range, traffic growth, visitor-to-signup conversion, and signup-to-purchase conversion
- Expandable customer churn, revenue churn, expansion, downgrade, ARPU, margin, LTV:CAC, and monthly Sales & Marketing Overhead assumptions
- Ending MRR, ending ARR, total customers, maximum CAC, and maximum cost per signup
- Second metric row for payback period, predicted contribution LTV, actual blended paid CAC, and expected LTV:CAC. Predicted LTV uses customer-weighted acquisition ARPU (`total new MRR ÷ total new customers`) rather than ending blended ARPU, so active channel ARPUs affect LTV while changing logo churn alone cannot change LTV
- MRR trajectory, monthly revenue bridge, and customer-growth visualizations
- Monthly forecast table with visitors, signups, new customers, total customers, ARPU, MRR, ARR, and acquisition thresholds
- Whole-number people counts plus whole-dollar ARPU, Ending MRR, Ending ARR, Max CAC, and Max cost/signup on the main Forecast page
- A churn-value diagnostic showing implied churned-customer ARPU (`churned MRR ÷ churned customers`) and its ratio to opening ARPU, making the relationship between independently editable logo and revenue churn explicit
- Ten marquee metrics, including NRR (`1 + expansion − downgrade − revenue churn`) and SaaS Magic Number (`[latest ending ARR − ending ARR three months earlier] ÷ latest three months of Sales & Marketing Spend`). Spend includes paid media plus three months of salaries, commissions, and tools overhead; no additional annualization multiplier is applied
- Forecast export as a model-named ZIP containing `forecast.csv`, `budget-breakdown.csv`, `churn-overview.csv`, `mrr-overview.csv`, `growth-rate.csv`, `customers-overview.csv`, and `cash-flow.csv`; or as a shareable PDF report containing summary metrics, assumptions, the monthly forecast, all three main charts, all six Deep Dive charts, and dedicated Deep Dive tables
- One-click PNG export for every Forecast and Deep Dive chart at exactly 1230 × 600 pixels, with GrowthCast title/description typography and the current rendered chart fitted to the canvas; plus a designed 1200 × 1200 export containing all ten marquee metrics

### Methodology

A dedicated Methodology page documents the monthly calculation sequence, channel activation rules, paid-traffic formulas, customer and revenue bridges, unit economics, metric definitions, and recommended workflow.

### Deep Dive

A dedicated tab immediately after Forecast provides six forecast-driven analytical views, each with a chart and monthly breakdown table:

- Budget breakdown by paid subchannel, including go-live timing and monthly totals. The headline monthly budget is editable, and any channel point can be dragged vertically to override spend for that month.
- Churn overview with voluntary/delinquent revenue and customer churn. Revenue-churn points can be dragged vertically to override a specific month.
- MRR overview with new, expansion, downgrade, churn, ending MRR, and ARR
- Growth rate with net-new MRR and month-over-month growth
- Customers overview with new customers, voluntary/delinquent churn, and ending customers
- Cash flow with editable fee and refund percentages, a monthly/annual plan split, and optional one-time payments as a third split component. Monthly subscription cash uses ending MRR × monthly share; annual and one-time cash use new MRR × their share × 12; fees and refunds reduce gross cash.

Editable Budget and Churn charts each include a local reset and an optional toggle that applies a point edit through every future month. An Advanced budget controls disclosure contains the optional compounded monthly increase, isolated total-budget change, forward step change, and subchannel spend editor, keeping the default Budget view focused on the chart. Dragging one subchannel’s budget point moves spend in $100 increments, proportionally redistributes the remainder across other enabled paid channels, keeps each affected monthly total fixed, and immediately updates the table. Churn dragging snaps to 0.1 percentage-point increments. Equivalent labeled month/channel/rate inputs support keyboard and assistive-technology editing without dragging. Chart lines can be shown or hidden independently on each Deep Dive tab. Mixed movement/total or monetary/rate charts use independent left and right axes with zero aligned at the same vertical position. Tooltips show monetary values with currency prefixes and two decimal places. Monthly budget and churn overrides immediately recalculate that month and all subsequent forecast balances; they persist locally, round-trip through assumption exports, and appear in exported PDF Deep Dive pages. Churn tables and CSV/PDF exports include churned-customer ARPU and its ratio to opening ARPU. Churn, downgrade, and other loss bars render below the X-axis as negative values, while New and Expansion remain visible above it; all movement bars align on the same monthly position rather than staggering. Visitors, signups, new customers, churned customers, and ending customers are emitted and displayed as whole people. Customer charts use the right axis for new-customer movement.

### Channel settings

A separate page keeps channel configuration out of the main forecast. Channel names, labels, values, and tabs use a high-legibility treatment. It includes tabs for:

- **General:** Set visitor-to-signup conversion, signup-to-purchase conversion, and new-customer ARPU across every subchannel at once; individual channels can still override them afterward
- **Direct Response:** Branded Search, Non-Brand Search, Meta, Reddit, Pinterest, LinkedIn, TikTok, and Snapchat
- **Demand Gen:** YouTube, Display, and CTV through Vibe.co/Quantcast
- **Owned / Partner / Custom:** SEO/organic, Partners, Enterprise/B2B, and Custom. Partners additionally support affiliate commission percentage and commission duration; defaults reflect the current 30% recurring, 12-month affiliate offer.

Every channel supports:

- Go-live month; `0` disables the channel completely and proportionally redistributes its paid allocation across the remaining enabled paid channels
- Hide, show, and restore controls
- Expandable visitor-to-signup, signup-to-purchase, and ARPU assumptions

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

Loading either JSON or the exported CSV restores the model name, baseline metrics, starting month, and all assumptions. Files are parsed and validated locally before application state changes.

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

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

Binding to `127.0.0.1` keeps the app local to your machine.

## Development

The repository follows a container-first workflow. The Docker build installs dependencies inside the image and runs all required checks:

1. ESLint
2. Vitest
3. TypeScript project build
4. Vite production build

Package scripts available inside a Node container are:

```bash
npm run dev
npm run lint
npm test
npm run build
npm run preview
```

For UI changes, validate the running production image with Playwright at desktop and mobile widths. The responsive layout stacks forecast cards, wraps navigation/actions, adapts Deep Dive controls, and keeps large tables horizontally scrollable on narrow screens.

## Architecture

```text
src/
├── App.tsx                 UI, pages, state, JSON/CSV import and export
├── styles.css              Responsive visual system
└── engine/
    ├── forecast.ts         Pure deterministic monthly model
    ├── forecast.test.ts    Forecast invariants and regression tests
    ├── metrics.ts          Cash flow, NRR, blended CAC, and Magic Number
    └── metrics.test.ts     SaaS metric and cash-flow regression tests
```

The React layer owns presentation and transient state. Forecast formulas belong in `src/engine/forecast.ts` so they remain deterministic and independently testable.

See [`AGENTS.md`](AGENTS.md) for concise contribution rules and [`CLAUDE.md`](CLAUDE.md) for complete architecture context.

## Assumption JSON compatibility

Exports currently use `schemaVersion: 2`; version 1 JSON remains import-compatible and defaults its starting month to August 2026. Import and local-state loading share a version-aware validator. It rejects unsupported versions, malformed baselines, incomplete or out-of-range assumptions, duplicate/invalid channels, invalid override maps, invalid cash splits, negative values, and non-finite numbers before applying state. If the contract changes, increment the schema version and provide a migration or explicit compatibility error.

## Privacy and security

- No authentication or external API credentials
- No server-side persistence; model progress is stored only in the current browser's local storage
- No automatic upload of assumptions or forecast data
- Reload-safe progress stored locally under the versioned browser key `growth-model-state-v1`
- Imported JSON is treated as data, not HTML or executable code
- Local container examples bind only to localhost
- `.env` files, build output, dependencies, screenshots, and `CONTINUITY.md` are excluded from Git

## Deployment

[`vercel.json`](vercel.json) configures Vercel to install with `npm ci`, run the verified Vite build, serve `dist`, preserve SPA routing, and apply CSP, HSTS, frame, MIME, referrer, and permissions-policy security headers. The nginx image mirrors all applicable non-TLS headers. The production project is `b2b-saas/growth-model` at <https://growthcast.app>.

```bash
vercel link --project growth-model --scope b2b-saas --yes
vercel deploy --prod --yes
```

Public-deployment follow-ups are monitoring, formal privacy/legal pages, and a documented rollback owner.

## Limitations

- Calibration assumptions originated from private historical exports that are not bundled with the application.
- Channel CPC, CPM, CTR, allocation, timing, and conversion values are planning assumptions rather than guaranteed performance.
- The current application is single-user and in-memory.
- There is no hosted collaboration, database, authentication, or automatic source-data refresh.
- The production JavaScript bundle currently emits a non-blocking Vite chunk-size warning.

## License

Licensed under the terms in [`LICENSE`](LICENSE).
