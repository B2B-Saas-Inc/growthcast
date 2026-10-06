# Monthly retainers, staffing, and capacity

Staging feature added before the document phase, per the user's 2026-09-25 request. Team rates are **internal hourly costs**, separate from existing invoice/time billing rates. All new planning routes require owner/admin organization membership. Client project responses remain unchanged because planning data is stored in separate tables and is never included in client serializers.

## User flow

- Project → **Budget & team**: monthly retainer and target billing rate, calculated included hours, project team assignments, monthly hours and project-specific cost rates.
- **Reports → Capacity**: each internal member's available monthly capacity and default internal cost; planned/logged utilization, remaining capacity and allocations across active projects.
- **People → Team**: existing invitation/membership flow; new assignment controls do not send emails or give clients staff access.
- Expected cost = full retainer hour allowance × weighted internal rate of allocated team hours. Planned team cost separately totals the explicitly allocated hours × each rate.
- Actual labor cost = each member's completed logged hours in the selected UTC month × their current project cost rate. Gross margin = (retainer − labor cost) ÷ retainer. Unknown cost rates flag incomplete costing and suppress margin. Zero retainer produces no percentage.
- Example: $4,000 / $218 = 18.348623853 hours. A $109 internal rate gives $2,000 expected cost / 50% margin; 15 logged hours cost $1,635 / 59.125% actual margin.

Hours are stored as whole minutes, money as integer cents. An 18.35-hour assignment rounds to 1,101 minutes, so planned assigned cost is $2,000.15; the full-allowance expected cost remains exactly $2,000. Tiny differences below half a minute do not display as over-allocation. Capacity is explicitly set per member, not assumed to be 160 hours. Zero capacity is allowed; percentages show unavailable instead of dividing by zero. Archived/completed projects stop consuming planned capacity; actual utilization still counts completed logged time across projects.

## Scope and accounting interpretation

Recurring monthly plans have no historical snapshots or automatic start/end-date proration. The month selector changes actual logged time, not the recurring plan. Changing a project cost rate recalculates historical comparisons; changing a member default only prefills future assignments. UI labels explicitly disclose this. Running timers are excluded until stopped; entries are attributed by start timestamp in UTC. These are operational gross-margin calculations, excluding overhead, taxes, invoiced/collected revenue, and revenue recognition. Zero logged time is a partial-month result, not an earned margin guarantee.

## Implementation

- `runtime/atrium-patches/resource-planning.ts`: validated DTOs, organization-scoped service and owner/admin-only controller. Tagged Prisma SQL queries are parameterized. Existing pinned upstream checkout stays clean.
- `007-resource-planning.sql`: additive managed migration; project budget, project staff, member capacity, cascading deletion, numeric bounds, explicit runtime/backup permissions. Previous six migration files and checksums are untouched. Private schemas remain unavailable through the Supabase Data API.
- `planning-ui.tsx`, `prepare.py`: shared branded components and archive overlays for the project tab and Reports navigation.
- `migration-evidence.json`: verified-TLS restricted-role migration, repeated application no-op and schema guard. Temporary migration login disabled in `finally`.
- `deployment.json`: API task/service update. Canonical frontend deployment is recorded in `../web-app/deployment.json`.
- `recovery-deployment.json`: backup + restore images carry the seventh migration; workflow/IAM pin exactly the new task definitions. Schedule, notification address, network access and secret roles are unchanged.

A rollback to pre-feature application code must retain the seven-migration guard manifest; old runtime images intentionally fail the current schema-version guard. Historical backup receipts retain their matching historical restore images; do not use the new seven-migration restore image against six-migration archives.

## Verification

Focused API tests cover requested financial example, missing rates, zero values, leap-year month bounds, invalid numbers, controller roles, foreign projects, and invalid team assignments. API and frontend compile checks pass. The full disposable managed-schema suite verifies migration idempotence/drift, private AppModule access, database restart, scoped restore and overwrite refusal. `verify.py` exercises the deployed UI and authenticated client-denial probes using isolated synthetic organizations. `verify-recovery.py` executes the real updated backup → independent restore workflow. See final JSON receipts for completion status; retained review-account data is never used as a writable fixture.
