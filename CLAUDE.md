# CLAUDE.md

This file provides persistent context for AI agents working on Growth Model. Read it fully before writing any code.

## Project overview

Growth Model is a white-labelled, local-first SaaS forecasting application for operators who need to model acquisition, customers, recurring revenue, and unit economics. Users configure global and per-channel assumptions, compare scenarios, inspect monthly outputs, and exchange versioned assumption sets as JSON. The current stage is a functioning local MVP with no monetization, accounts, backend, or deployment service.

The primary activation action is changing an assumption or loading an assumption set and seeing the forecast update deterministically.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React, TypeScript, Vite |
| Charts | Recharts |
| Icons | Lucide React |
| Backend/API | None; explicitly deferred |
| Database/ORM | None; explicitly deferred |
| Authentication/tenancy | None; local single-user app |
| Email/payments/storage/jobs/cache/search | Not applicable |
| Monitoring/analytics/flags/CMS | Not configured |
| Persistence | Browser session state; JSON import/export |
| Unit tests | Vitest |
| E2E validation | Pi `playwright_validate` |
| Production runtime | Static nginx container |
| CI/CD and public hosting | `[TO CONFIGURE]` |

## Directory structure

```text
.
├── src/
│   ├── App.tsx                 # UI, local state, import/export, pages
│   ├── styles.css              # Responsive visual system
│   ├── main.tsx                # React entry point
│   ├── data/
│   │   └── historical.json     # Frozen normalized historical dataset
│   └── engine/
│       ├── forecast.ts         # Pure deterministic forecasting engine
│       └── forecast.test.ts    # Engine invariants and regressions
├── artifacts/                  # Local screenshots; ignored
├── Dockerfile                  # Test/build stage and nginx runtime
├── nginx.conf                  # SPA fallback and localhost container server
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

`src/App.tsx` owns transient UI state and renders three logical pages: Forecast, Channels, and Methodology. It may format and present outputs but must not duplicate forecast formulas. Keep the app white-labelled. The editable model name controls document title and exported filenames and must round-trip through assumption JSON.

### Forecast engine

`src/engine/forecast.ts` is a pure deterministic monthly simulation. Inputs are the last complete historical month, global assumptions, and channel assumptions. Outputs must be traceable to inputs and safe to recalculate on every state change.

Required invariants:

- Historical calibration covers August 2024–July 2026; August 2026 is partial.
- Visitor data uses unique `Page view` users.
- Signup data uses unique `User Signup` users.
- Baseline visitor-to-signup conversion is 13.7%.
- Baseline signup-to-purchase conversion is 0.8%.
- Customer churn and revenue churn remain distinct.
- Channel traffic is introduced once at go-live, then compounds only with global Traffic growth.
- Live month `0` excludes the channel from traffic, spend, allocation, customers, and revenue.
- Direct response: `visitors = allocatedSpend / CPC`.
- Demand generation: `visitors = allocatedSpend / CPM * 1,000 * CTR`.
- Expected CPC is `allocatedSpend / visitors`.
- Actual blended CAC is total enabled paid launch spend divided by new customers predicted from paid launch traffic.
- Predicted LTV is ending revenue LTV multiplied by gross margin.
- Payback months is blended CAC divided by ending monthly ARPU multiplied by gross margin.
- Expected LTV:CAC is predicted contribution LTV divided by blended CAC.
- MRR bridge separately exposes new, expansion, downgrade, and churn movements.
- ARR is ending MRR multiplied by 12.
- People display as whole numbers. Other UI values display at most one decimal place.

### Data

`src/data/historical.json` is a frozen local fixture, not a live Mixpanel or billing integration. Preserve provenance fields and partial-month flags. Never embed credentials. If the source data is refreshed, validate the full date series and add a reproducible normalization script before replacing the fixture.

### Assumption-set contract

JSON exports include:

- `schemaVersion`
- `exportedAt`
- `modelName`
- `forecastStartMonth`
- `scenario`
- `budget`
- `assumptions`
- `channels`

Exports support JSON and a two-column CSV representation whose values are JSON encoded. Imports detect `.json` or `.csv` and must parse and validate the entire object before changing state. Reject unsupported versions, missing fields, invalid channel models, negative values, non-finite numbers, and malformed arrays. If the shape changes, increment `schemaVersion`, document it, and provide a migration or clear compatibility error.

### Authentication, onboarding, and tenancy

Not applicable to this local single-user version. Do not add login, cookies, local-storage auth state, workspaces, or tenant logic speculatively. If a hosted multi-user version is approved, design server-side authorization and tenant-scoped persistence before implementation.

### Database, API, billing, email, storage, jobs, and caching

Not currently applicable. If introduced, use schema-as-code, reviewed migrations, explicit authorization, boundary validation, idempotent mutations, secure provider-hosted payments, verified webhooks, managed secrets, durable queues, explicit cache TTLs, and least privilege. Never simulate durable infrastructure with browser state or `setTimeout`.

### Observability and analytics

Not configured. Browser console errors must remain zero in validation. A future hosted version should add privacy-safe error reporting and consent-aware product analytics; never send names, email addresses, secrets, imported assumptions, or financial model contents without explicit consent.

### Security

The app is static and local-first. Maintain these controls:

- No credentials, secrets, or live API tokens in the bundle.
- Validate imported files before state mutation.
- Do not execute or inject imported content as HTML or code.
- Keep dependencies pinned through `package-lock.json` and review additions.
- Bind local container examples to `127.0.0.1`.
- Add CSP, HSTS, frame protection, MIME protection, and referrer policy before public hosting.
- Never log imported financial assumptions unnecessarily.

### Marketing, SEO, legal, internationalization, notifications, and admin

These systems do not exist in the local MVP. A public deployment must add appropriate metadata, canonical URLs, robots/sitemap policy, privacy and terms documents, consent handling, and deployment ownership. Localization is deferred; keep formatting centralized with `Intl` so future locale support remains possible. Do not add an admin panel or notifications without a backend and explicit requirements.

### CI/CD and deployment

Current deployment is a local multi-stage Docker image. A hosted pipeline is `[TO CONFIGURE]`. Any future CI must block merges on lint, tests, type check, build, and risk-relevant Playwright checks. Use immutable artifacts, managed secrets, preview validation, and documented rollback. Do not run unsafe automatic migrations if persistence is later introduced.

## Testing

- Add unit tests for every forecast formula or state-independent model invariant.
- Test edge cases: zero churn, zero CPC/CPM, zero allocation, live month zero, delayed go-live, empty channels, and deterministic repeated runs.
- Use Playwright for page navigation, channel tabs, hide/restore, JSON round-trip, export downloads, responsive overflow, accessibility attributes, and zero console errors.
- Use stable labels and roles rather than coordinates.
- A change is not complete until container lint, tests, type checking, and build pass.

## Data and exports

Forecast CSV plus assumption JSON/CSV are generated entirely in the browser. Filenames derive from the sanitized model name. Exports must contain no credentials and should remain portable. A future hosted archive/export feature would require authorization, expiring downloads, retention policy, encrypted backups, and restore testing; these are not part of the current app.

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

None are currently required. Do not create `.env` files unless a runtime integration is approved. If variables are introduced, add a secret-free `.env.example`, distinguish server-only from browser-safe values, validate them at startup, and document every variable here.

## Terminology

- **Model name**: User-supplied white-label name stored in assumption JSON.
- **Scenario**: Named set of global forecast assumptions.
- **Baseline traffic**: Historical visitor base compounded by global Traffic growth.
- **Channel**: Acquisition source with a go-live month and funnel assumptions.
- **Subchannel**: Individually configurable paid or owned channel within a tab.
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
