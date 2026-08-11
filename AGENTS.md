# AGENTS.md

Instructions for coding agents working in this repository.

## Start here

1. Read `README.md`, `CLAUDE.md`, and local `CONTINUITY.md` when present.
2. Inspect the current implementation before proposing architectural changes.
3. Use GrowthCast as the default product/model identity, while preserving the editable model name on Baseline for white-labelled document titles and export filenames. Preserve the homepage's practitioner-led voice and route its primary calls to Baseline.
4. Use containers for dependency installation and verification. Do not install host packages.

## Architecture

- React + TypeScript + Vite single-page application with Home as the default page and Baseline as the model-entry workflow. Forecast, Deep Dive, and Channels remain gated until all five baseline metrics are greater than zero.
- No backend, authentication, database, cookies, or live analytics connection.
- Private historical source data is not bundled or tracked. The editable runtime opening state is the Baseline page; any local `baseline.csv` is private and Git/Docker-ignored.
- Forecast calculations belong in `src/engine/forecast.ts`, cumulative channel cohort attribution in `src/engine/channelBreakdown.ts`, and cash-flow/SaaS metrics in `src/engine/metrics.ts`; do not duplicate them in React components.
- Reload-safe progress is local-only under versioned key `growth-model-state-v1`; assumption-set JSON/CSV is independently versioned with `schemaVersion`.
- Production hosting supports static nginx from the multi-stage `Dockerfile` and Vercel via `vercel.json`.

## Model invariants

- Calibration used complete private history from August 2024 through July 2026; raw history must not be bundled. Runtime always begins from user-entered/imported baseline visitors, customers, and MRR.
- `User Signup` is the signup event; `Page view` unique users are the visitor series.
- Baseline visitor-to-signup is 13.7%; baseline signup-to-purchase is 0.8%.
- Days to upgrade shifts uniformly acquired monthly signups into paid customers and new MRR using actual calendar-month lengths; conversions after month end roll into subsequent months. The default is the current trailing-30-day 3.0-day Mixpanel average.
- A channel contributes its launch traffic once in its go-live month. Thereafter that cohort compounds only at the global Traffic growth rate.
- Live month `0` disables a channel completely, including traffic, spend, and budget allocation.
- Direct-response traffic = allocated spend / CPC.
- Demand-generation traffic = allocated spend / CPM * 1,000 * CTR.
- Partner acquisition cost uses ARPU × commission rate across the commissioned months, geometrically adjusted by monthly revenue retention, and contributes to blended CAC.
- Keep revenue and customer churn independently editable, but reconcile their relationship through `churned customer ARPU = churned MRR ÷ churned customers` and its ratio to opening ARPU. Include both diagnostics in Forecast and churn CSV/PDF outputs.
- Predicted contribution LTV uses customer-weighted acquisition ARPU: `(total new MRR ÷ total new customers) × gross margin ÷ effective revenue churn`, never ending blended ARPU. Active channel ARPUs must affect LTV in proportion to acquired customers; zero-customer channels must not; changing logo churn alone must not change LTV.
- Never use floating-point values as stored currency in any future persistence layer. The current in-memory display model may calculate with numbers.
- Monthly Forecast rows expand one at a time into a channel attribution table grouped as Baseline / Existing Business, Direct Response, Demand Gen, and Owned / Partner / Custom. Include launched enabled channels even when their current traffic is zero; cumulative channel customers and MRR must use the same logo churn, revenue churn, expansion, and downgrade assumptions and category totals must reconcile to the parent month.
- People counts display as whole numbers. On the main Forecast page, ARPU, Ending MRR, Ending ARR, Max CAC, and Max cost/signup are whole dollars; other displayed values use at most one decimal place.
- Dual Deep Dive Y axes align zero at the same vertical position, targeted at 80% of plot height so signed bars sit near the X-axis and whitespace remains above. Apply the same lower-zero domain to Cash flow.
- Budget and churn point edits may optionally propagate through future months. Keep monthly budget growth, isolated month totals, forward step totals, and subchannel spend inputs under the default-collapsed Advanced budget controls disclosure; all must flow through channel traffic, the forecast engine, persistence, and exports.
- Cash-flow active plan shares must total 100%. Monthly cash = ending MRR × monthly share; annual and one-time cash = new MRR × share × 12; fees/refunds are negative percentages of gross cash.
- Ending-month NRR = 1 + expansion − downgrade − effective ending-month revenue churn. SaaS Magic Number = (latest ending ARR − ending ARR three months earlier) ÷ latest three months of Sales & Marketing spend. Spend includes modeled paid budget plus monthly salaries/commissions/tools overhead; do not multiply the numerator by 4. Show unavailable without four projected months or when the three-month spend is zero.
- Actual Blended CAC includes one month of Sales & Marketing Overhead alongside paid launch spend and churn-adjusted affiliate commissions before dividing by attributed acquired customers.
- Every chart image export is an exact 1230 × 600 PNG of the current visible chart state, fitted to the canvas with unclipped axes, local site fonts, title, and description. The designed combined ten-metric export is an exact 1200 × 1200 PNG with title and description.
- CSV forecast export is a ZIP with seven root-level files: `forecast.csv`, `budget-breakdown.csv`, `churn-overview.csv`, `mrr-overview.csv`, `growth-rate.csv`, `customers-overview.csv`, and `cash-flow.csv`. Each file must reflect saved monthly budget/churn overrides and cash-flow settings.

## Commands

```bash
# Full required verification
docker build -t growth-model .

# Run locally
docker run --rm -p 127.0.0.1:8080:8080 growth-model
```

The Docker build runs lint, unit tests, type checking, and the production build. For UI changes, also run `playwright_validate` against the running container at desktop and mobile widths.

## Change discipline

- Make the smallest reviewable change.
- Add or update deterministic tests for `src/engine/forecast.ts`, `src/engine/channelBreakdown.ts`, and `src/engine/metrics.ts` behavior.
- Keep dependencies pinned, use `npm ci` in Docker/Vercel, validate persisted/imported state atomically, and preserve CSP/HSTS plus the mirrored nginx security headers.
- Validate imported JSON before mutating application state.
- Preserve backwards compatibility or increment `schemaVersion` with a documented migration.
- Do not commit generated screenshots, environment files, secrets, `CONTINUITY.md`, dependencies, or build output.
- Update `README.md` and `CLAUDE.md` when behavior, architecture, commands, or assumptions change.
