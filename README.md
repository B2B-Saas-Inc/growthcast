# Growth Model

A white-labelled, local-first SaaS growth and recurring-revenue forecasting application. Configure acquisition channels, funnel conversion, customer and revenue churn, expansion, ARPU, margin, and LTV:CAC targets; then inspect the monthly effect on customers, MRR, ARR, and allowable acquisition cost.

The application has no backend, accounts, credentials, or live API dependency. It runs as a static site and keeps assumptions in browser memory unless you export them as JSON.

## Features

### Baseline setup

The first tab defines the opening state for the model instead of requiring the bundled project data. Users can enter baseline month, visitors, signups, new customers, total customers, and MRR; ARPU and ARR are derived automatically. The page can upload or export baseline CSV files and also load a complete assumptions JSON/CSV.

The repository includes [`baseline.csv`](baseline.csv) with the original project baseline: July 2026, 5,594 visitors, 719 signups, 27 new customers, 599 total customers, and $22,858 MRR.

### Forecast

- Editable model name used in the document title and exported filenames
- Conservative, Baseline, and Ambitious scenario presets
- Starting-month selector covering August 2026 through August 2028
- Adjustable forecast range, traffic growth, visitor-to-signup conversion, and signup-to-purchase conversion
- Expandable customer churn, revenue churn, expansion, downgrade, ARPU, margin, and LTV:CAC assumptions
- Ending MRR, ending ARR, total customers, maximum CAC, and maximum cost per signup
- Second metric row for payback period, predicted contribution LTV, actual blended paid CAC, and expected LTV:CAC
- MRR trajectory, monthly revenue bridge, and customer-growth visualizations
- Monthly forecast table with visitors, signups, new customers, total customers, ARPU, MRR, ARR, and acquisition thresholds
- Whole-number people counts and at most one decimal place for other displayed values
- Forecast export as CSV or a shareable, model-named PDF report containing summary metrics, assumptions, and the monthly forecast

### Methodology

A dedicated Methodology page documents the monthly calculation sequence, channel activation rules, paid-traffic formulas, customer and revenue bridges, unit economics, metric definitions, and recommended workflow.

### Channel settings

A separate page keeps channel configuration out of the main forecast. Channel names, labels, values, and tabs use a high-legibility treatment. It includes tabs for:

- **General:** Set visitor-to-signup conversion, signup-to-purchase conversion, and new-customer ARPU across every subchannel at once; individual channels can still override them afterward
- **Direct Response:** Meta, Reddit, Pinterest, LinkedIn, TikTok, and Snapchat
- **Demand Gen:** YouTube, Display, and CTV through Vibe.co/Quantcast
- **Owned / Partner / Custom:** SEO/organic, Partners, Enterprise/B2B, and Custom

Every channel supports:

- Go-live month; `0` disables the channel completely and proportionally redistributes its paid allocation across the remaining enabled paid channels
- Hide, show, and restore controls
- Expandable visitor-to-signup, signup-to-purchase, and ARPU assumptions

Paid media begins with a $50,000 monthly budget and editable subchannel allocations. Dollar allocations and expected traffic are calculated automatically:

```text
Direct-response visitors = allocated spend / CPC
Demand-generation visitors = allocated spend / CPM * 1,000 * CTR
Expected CPC = allocated spend / calculated visitors
```

Channel traffic enters the model once in its go-live month. From then on, active traffic compounds only through the global Traffic growth assumption; the launch contribution is not added repeatedly.

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

## Historical data

The bundled fixture contains normalized monthly history from August 2024 onward:

- Complete calibration period: August 2024–July 2026
- Partial context: August 2026, excluded from calibration
- Visitors: unique Mixpanel `Page view` users
- Signups: unique Mixpanel `User Signup` users
- Customer and recurring-revenue metrics: supplied ChartMogul-style exports

Current Baseline assumptions include:

- Visitor-to-signup: 13.7%, weighted over the trailing six complete months
- Signup-to-purchase: 0.8%
- Starting paid-media budget: $50,000/month

The app ships the frozen dataset in `src/data/historical.json`; it does not ship Mixpanel or billing-system credentials.

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

For UI changes, validate the running production image with Playwright at desktop and mobile widths.

## Architecture

```text
src/
├── App.tsx                 UI, pages, state, JSON/CSV import and export
├── styles.css              Responsive visual system
├── data/
│   └── historical.json     Frozen normalized history
└── engine/
    ├── forecast.ts         Pure deterministic monthly model
    └── forecast.test.ts    Model invariants and regression tests
```

The React layer owns presentation and transient state. Forecast formulas belong in `src/engine/forecast.ts` so they remain deterministic and independently testable.

See [`AGENTS.md`](AGENTS.md) for concise contribution rules and [`CLAUDE.md`](CLAUDE.md) for complete architecture context.

## Assumption JSON compatibility

Exports currently use `schemaVersion: 2`; version 1 JSON remains import-compatible and defaults its starting month to August 2026. Import rejects unsupported versions, incomplete files, invalid channel types, negative values, and non-finite numbers. If the contract changes, increment the schema version and provide a migration or explicit compatibility error.

## Privacy and security

- No authentication or external API credentials
- No server-side persistence
- No automatic upload of assumptions or forecast data
- Imported JSON is treated as data, not HTML or executable code
- Local container examples bind only to localhost
- `.env` files, build output, dependencies, screenshots, and `CONTINUITY.md` are excluded from Git

Before public internet deployment, add suitable security headers, hosting controls, privacy terms, monitoring, and a deployment runbook.

## Limitations

- Historical acquisition scope depends on the bundled Mixpanel extraction.
- Channel CPC, CPM, CTR, allocation, timing, and conversion values are planning assumptions rather than guaranteed performance.
- The current application is single-user and in-memory.
- There is no hosted collaboration, database, authentication, or automatic source-data refresh.
- The production JavaScript bundle currently emits a non-blocking Vite chunk-size warning.

## License

No license has been selected. Add one before distributing the project outside its intended private use.
