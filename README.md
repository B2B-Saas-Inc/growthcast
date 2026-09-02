# GrowthCast

GrowthCast is a GTM Engineering agency site for Series A and later companies with product-market fit. Its free, local-first Forecast tool models acquisition, recurring revenue, and unit economics.

The application has no backend or accounts. It runs as a static site and automatically persists the model name, baseline, global assumptions, channel defaults, budget, and channel configuration in browser local storage so progress survives reloads. JSON and CSV exports remain available for sharing and backup. PostHog provides product analytics and receives contact details only when a user explicitly submits a contact or Growth Plan form.

Astro owns the static routes, metadata, blog, RSS feed, and sitemap. The agency and Forecast experience is rendered as a React island so its existing local-first state and export workflows remain interactive without turning the blog into a client-side application.

## Features

### Agency homepage

The default route presents GrowthCast as **GTM Engineering for Growth**. It targets founders, CEOs, VC partners, and private-equity partners at Series A and later companies that have traction but need a repeatable growth system. Its full-width hero leads into the AAARRR operating view, Current Demand / Future Demand, anonymized directional proof, fit, and the Forecast resource. Proof language must be checked for scope, attribution, evidence, and publication permission before final copy.

Agency contact requests use the configured PostHog delivery path. The contact dialog reports an actionable error instead of claiming success when analytics is unavailable or the browser is offline, and it supports focus containment, Escape dismissal, and focus restoration.

**Why GrowthCast** at `/why-growthcast` explains the cross-functional growth problem and GTM Engineering point of view. **How We Work** at `/how-it-works` focuses on the four engagement stages and client operating changes rather than repeating the homepage. The agency header has no Services tab. It links to both pages and **Resources > Tools > Forecast**. The Forecast tool is available at `/resources/tools/forecast`; direct visits and browser history preserve the agency/tool boundary. Inside the tool, Reset, assumption import/export, forecast format, and forecast export controls live in the **Tools** dropdown beside Methodology.

### Baseline setup

The editable model name lives with the baseline inputs. GrowthCast is the default identity, while changing the model name updates the document title and export filenames. New and reset models default the baseline to the current calendar month and begin the forecast in the following month.

The first tab defines the opening state and lets the user choose a B2C or B2B model. B2C preserves the visitor → signup → purchase workflow: users enter baseline month, visitors, signups, new customers, total customers, and MRR; ARPU and ARR are derived automatically. B2B uses the latest complete month's steady-state pipeline flow with visitors, MQLs, SQLs, new customers, total customers, and ARR. Each funnel stage must be no larger than the preceding stage. The observed MQL, SQL, and closed-won throughput calibrates the three pipeline conversion rates; the average deal cycle controls when forecast SQL cohorts close. MRR and average monthly revenue per account are derived automatically. The page can upload or export baseline CSV files and also load a complete assumptions JSON/CSV.

The application starts with zeroed metrics and contains no bundled private historical performance. Forecast, Deep Dive, and Channels remain available when baseline metrics are zero, so users can model from a pre-revenue or empty starting state. Master Reset returns to B2C Baseline and clears the model. Baseline files include the selected business model and paid-media budget.

### Forecast

- Editable model name used in the document title and exported filenames
- Conservative, Baseline, and Ambitious scenario presets
- Starting-month selector covering August 2026 through August 2028
- Adjustable forecast range, traffic growth, visitor-to-signup conversion, signup-to-purchase conversion, and average days from signup to upgrade
- B2B pipeline assumptions for visitor-to-MQL, MQL-to-SQL, SQL-to-closed-won, average deal cycle in days, and ACV. Closed-won customers and new MRR are delayed with actual calendar-month lengths; `new MRR = closed won × ACV ÷ 12`
- A B2B pipeline-over-time chart for MQLs, SQLs, and closed-won customers alongside the combined MRR/ARR trajectory and revenue bridge. B2B wins and churn occur in whole-account units, while MRR moves in whole monthly-contract increments derived from ACV; sub-account wins and sub-contract revenue churn carry no movement
- Expandable customer churn, revenue churn, expansion, downgrade, ARPU, margin, LTV:CAC, and monthly Sales & Marketing Overhead assumptions
- Ending MRR, ending ARR, total customers, maximum CAC, and maximum cost per signup
- Second metric row for payback period, predicted contribution LTV, actual blended paid CAC, and expected LTV:CAC. Predicted LTV uses customer-weighted acquisition ARPU (`total new MRR ÷ total new customers`) rather than ending blended ARPU, so active channel ARPUs affect LTV while changing logo churn alone cannot change LTV
- MRR trajectory, monthly revenue bridge, and customer-growth visualizations
- Expandable monthly forecast table with visitors, signups, new customers, total customers, ARPU, MRR, ARR, and acquisition thresholds. Clicking a month reveals reconciled cumulative cohort rows grouped under Baseline / Existing Business, Direct Response, Demand Gen, and Owned / Partner / Custom; launched channels retain customers and MRR through the same monthly logo churn, revenue churn, expansion, and downgrade assumptions; disabled and pre-launch channels remain absent
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
```

For UI changes, validate the running production image with Playwright at desktop and mobile widths. The responsive layout stacks forecast cards, wraps navigation/actions, adapts Deep Dive controls, and keeps large tables horizontally scrollable on narrow screens.

At mobile widths, agency navigation remains fully available in a touch-sized grid, marketing sections use reduced type and spacing, dense forecast controls stack, and charts preserve readable axes through contained horizontal scrolling. Contact and Growth Plan overlays use dynamic viewport limits and safe-area padding.

## Architecture

```text
src/
├── AgencyApp.tsx           Lightweight agency island and contact flow
├── App.tsx                 Forecast island, state, and exports
├── components/             Astro shell and React island entry points
├── content/blog/           Typed Markdown/MDX blog posts
├── layouts/                Shared Astro metadata and document shell
├── pages/                  Static routes, blog pages, and RSS endpoint
├── styles.css              Forecast and agency visual system
├── blog.css                GrowthCast blog visual system
├── posthog.ts              Deferred agency analytics configuration
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

## Privacy and security

- No authentication or external API credentials
- No server-side persistence; model progress is stored only in the current browser's local storage
- No automatic upload of assumptions or forecast data
- Reload-safe progress stored locally under the versioned browser key `growth-model-state-v1`
- Imported JSON is treated as data, not HTML or executable code
- Local container examples bind only to localhost
- `.env` files, build output, dependencies, screenshots, and `CONTINUITY.md` are excluded from Git

## Deployment

[`vercel.json`](vercel.json) configures Vercel to install with `npm ci`, run the verified Astro build, serve `dist`, preserve the PostHog proxy, and apply HSTS, frame, MIME, referrer, and permissions-policy security headers. Astro generates a per-page hash-based CSP that permits its hydration scripts without weakening script policy. The nginx image serves Astro's generated directory routes and mirrors all applicable non-TLS headers. The production project is `b2b-saas/growth-model` at <https://growthcast.app>.

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
