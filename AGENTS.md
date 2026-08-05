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
- Forecast calculations belong in `src/engine/forecast.ts`, not React components.
- Reload-safe progress is local-only under versioned key `growth-model-state-v1`; assumption-set JSON/CSV is independently versioned with `schemaVersion`.
- Production hosting supports static nginx from the multi-stage `Dockerfile` and Vercel via `vercel.json`.

## Model invariants

- Calibration used complete private history from August 2024 through July 2026; raw history must not be bundled. Runtime always begins from user-entered/imported baseline visitors, customers, and MRR.
- `User Signup` is the signup event; `Page view` unique users are the visitor series.
- Baseline visitor-to-signup is 13.7%; baseline signup-to-purchase is 0.8%.
- A channel contributes its launch traffic once in its go-live month. Thereafter that cohort compounds only at the global Traffic growth rate.
- Live month `0` disables a channel completely, including traffic, spend, and budget allocation.
- Direct-response traffic = allocated spend / CPC.
- Demand-generation traffic = allocated spend / CPM * 1,000 * CTR.
- Partner acquisition cost uses ARPU × commission rate across the commissioned months, geometrically adjusted by monthly revenue retention, and contributes to blended CAC.
- Keep revenue and customer churn separate.
- Never use floating-point values as stored currency in any future persistence layer. The current in-memory display model may calculate with numbers.
- People counts display as whole numbers. On the main Forecast page, ARPU, Ending MRR, Ending ARR, Max CAC, and Max cost/signup are whole dollars; other displayed values use at most one decimal place.
- Dual Deep Dive Y axes align zero at the same vertical position.
- Budget and churn point edits may optionally propagate through future months. Monthly budget growth, isolated month totals, and step totals must flow through channel traffic, the forecast engine, persistence, and exports.
- Cash flow remains an explicitly labeled recurring-revenue proxy until annual billing, one-time payments, fees, and refunds have first-class engine inputs.
- Every chart image export is an exact 1230 × 600 PNG of the current visible chart state. The combined eight-metric export is an exact 1200 × 1200 PNG.

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
- Add or update deterministic tests for forecast-engine behavior.
- Validate imported JSON before mutating application state.
- Preserve backwards compatibility or increment `schemaVersion` with a documented migration.
- Do not commit generated screenshots, environment files, secrets, `CONTINUITY.md`, dependencies, or build output.
- Update `README.md` and `CLAUDE.md` when behavior, architecture, commands, or assumptions change.
