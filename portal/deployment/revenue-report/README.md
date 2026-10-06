# Monthly client revenue and engagement types

Reports → Monthly revenue is owner/admin-only. Select up to 36 months; the default is the current UTC calendar year. Project rows show assigned clients (a project with multiple clients is counted once), engagement type, revenue, expected labor cost, actual labor cost, target/actual gross margin, billed hours and logged hours. Each month has a subtotal and the entire range has a total. Aggregate margins use summed revenue and costs, not averages of percentages.

## Calculation rules

- Retainer: full budget amount each month from start through end, inclusive, without partial-month proration.
- Flat fee: full amount only in the project start month. Later months remain present with zero revenue and their actual labor costs, so full-range margin includes delivery costs after the initial month.
- Hourly: completed billable time entries **already attached to an invoice**, at their saved billing rates, grouped by UTC month worked. Invoice attachment includes draft invoices, as requested; this is not cash received. Legacy entries without a saved rate use the current budget target rate. New hourly time entries take their default billing rate from the Budget tab; existing snapshots are unchanged.
- Expected labor: allocated team hours determine the weighted internal hourly cost. Multiply by fee / target billing rate for retainers and flat fees, or by billed hours for hourly engagements. Flat-fee expected cost appears once, with its fee.
- Actual labor: all completed logged hours in each included month × current assigned project cost rates, including nonbillable and uninvoiced work. Running timers are excluded. Missing rates make the complete actual cost and margin unavailable; missing positive-hour allocations make expected costs unavailable. Totals also show incomplete rather than silently undercounting these costs.
- Margin: (revenue − cost) / revenue. Zero-revenue months have no percentage. Costs still contribute to combined totals.
- Missing budgets/start dates and reversed dates are listed for setup, not silently assigned invented dates. Missing end date means ongoing through the requested range. Archived and completed projects remain included by their dates, preserving historical reporting.

Current settings/rates recalculate past months; this is an operational report, excluding overhead, taxes and collection, not immutable accounting revenue recognition. Team capacity allocations remain recurring monthly for all engagement types.

Project → Budget & team offers Monthly retainer, Hourly, and Flat fee. Existing budgets default to retainer through additive managed migration 008. No existing fee/rate/date is changed by migration. Monthly expected/actual project comparisons use the same report revenue basis.

## Single-site settings

Organizations and Billing are hidden from dashboard Settings; direct visits redirect to Workspace. Custom Domain is removed from Workspace. Client invoice/payment functionality is retained. This is a UI simplification, not removal of tenant isolation or backend organization models.

## Deployment and verification

- API patches: `../runtime/atrium-patches/{resource-planning,revenue-report}.ts`, scoped controller guards and parameterized database reads/writes.
- `prepare.py` / `revenue-ui.tsx`: pinned frontend overlays; upstream checkout remains clean.
- `migration-evidence.json`: restricted migration role, verified TLS, repeated no-op and schema guard; migration login disabled in finally. Bounded retry accommodates temporary pooler authentication propagation after role activation.
- `deployment.json`: reviewed API task/service-only update.
- `acceptance.json`: real browser → authenticated API → database, using isolated fixture organizations. No read-response mocks, retained account writes, real emails, Stripe calls or charges.
- `cleanup-evidence.json`: exact fixture removal.
- `recovery-deployment.json` / `recovery-acceptance.json`: updated eight-migration backup and independent restore workflow. The daily schedule and alert recipient are unchanged. Historical receipts retain their corresponding historical image versions.

Rollback application images must retain the eight-migration schema guard; do not restart a prior seven-migration runtime against the new schema. No production deployment or document-phase scope is included.

Final staging rollout is complete. The real eight-migration backup → independent restore workflow returned VERIFIED, both task exit codes were zero, and the recovery lock was released. The exact synthetic fixture was removed.
