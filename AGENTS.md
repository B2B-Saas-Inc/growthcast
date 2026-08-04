# AGENTS.md

Instructions for coding agents working in this repository.

## Start here

1. Read `README.md`, `CLAUDE.md`, and local `CONTINUITY.md` when present.
2. Inspect the current implementation before proposing architectural changes.
3. Keep the application white-labelled: never add a company-specific product name to UI, metadata, filenames, or defaults.
4. Use containers for dependency installation and verification. Do not install host packages.

## Architecture

- React + TypeScript + Vite single-page application.
- No backend, authentication, database, cookies, or live analytics connection.
- Historical data is frozen in `src/data/historical.json`; the editable runtime opening state is the Baseline page and `baseline.csv` is the portable default fixture.
- Forecast calculations belong in `src/engine/forecast.ts`, not React components.
- Assumption-set JSON is local-only and versioned with `schemaVersion`.
- Production hosting is static nginx from the multi-stage `Dockerfile`.

## Model invariants

- Use complete bundled history from August 2024 through July 2026. August 2026 is partial and excluded from calibration. Do not hardcode it as the runtime opening state: users may replace baseline visitors, customers, and MRR.
- `User Signup` is the signup event; `Page view` unique users are the visitor series.
- Baseline visitor-to-signup is 13.7%; baseline signup-to-purchase is 0.8%.
- A channel contributes its launch traffic once in its go-live month. Thereafter that cohort compounds only at the global Traffic growth rate.
- Live month `0` disables a channel completely, including traffic, spend, and budget allocation.
- Direct-response traffic = allocated spend / CPC.
- Demand-generation traffic = allocated spend / CPM * 1,000 * CTR.
- Keep revenue and customer churn separate.
- Never use floating-point values as stored currency in any future persistence layer. The current in-memory display model may calculate with numbers.
- People counts display as whole numbers; other displayed values use at most one decimal place.

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
