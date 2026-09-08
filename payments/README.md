# Test payment receiver — review implementation

Receiver not deployed; no Stripe webhook created or live routing. The approved migration is now applied only to Supabase test project uaavuevyjudgaphmbdti. RLS and browser-role read denial were independently verified. A restricted LOGIN exists with credentials in Keychain, not source. Hosted TLS connection passes using the bundled public Supabase CA; see certs/README.md. Vercel preview deployment is blocked by an expired CLI token (403 invalidToken).

This isolated Node package now has a Vercel adapter at `api/stripe-test.mjs` (raw body parsing disabled, requested maxDuration 60 seconds), plus a standalone container adapter. It remains disabled without explicit test configuration. Verify deployed plan/runtime duration and TLS connectivity before activation; no deployment performed.

## Behavior

- Official Stripe SDK 18.5.0 verifies raw bytes and signature age (300 seconds); 256 KiB request limit. Rejects live events/foreign connected accounts. Startup verifies the fixed Stripe test account via API.
- Private Postgres schema stores minimal receipts, explicit invoice/customer/Engagement bindings and integer-minor-unit invoice history, never raw card/bank or webhook payloads.
- Duplicate event IDs are serialized with row locks. Per-Engagement advisory transaction lock is acquired before Stripe retrieval and Attio writes, preventing older payloads from being used. Events fetch current Stripe state; only the manually designated current invoice updates the Engagement summary.
- Existing, explicitly mapped test Engagements only. Never creates CRM records, Deals, tasks, invoices, charges or new memberships. Does not change PandaDoc or upfront-payment status. `Paid` is an invoice state, not a settlement claim.
- Unmapped events are durably quarantined. Errors return 503 for provider retry; prior receipt remains pending. Remote Attio PATCH can succeed before DB commit: retry re-fetches current Stripe and idempotently overwrites only summary fields, not creates side effects. This is not a distributed exactly-once transaction.
- Operator recovery is available through `node payments/recover.mjs`: default is a read-only batch preview and state counts; `--execute` retries at most five pending receipts. Library batches are capped at 25. Quarantined receipts are excluded and require operator mapping review. No scheduler or alerts are configured; schedule/monitoring remains an activation gate. A completed event replay is a no-op; later state needs its own event or explicit reconciliation.

## Safety / operating requirements

`migration.sql` is a one-time reviewed migration already applied to the dedicated test project. Do not reapply it blindly. It creates a private schema and NOLOGIN permission role; an approved server-only login, TLS-verified connection and secret-store provisioning are separate steps. Do not use the Postgres owner in deployment. Tables have RLS; no grants to browser roles. Connection must support real transactions (direct/session pooler); no HTTP query adapter. Runtime requires TLS certificate verification and rejects connection-string SSL overrides and superuser/BYPASSRLS roles. The login must inherit growthcast_payment_receiver. Bindings remain operator-write-only.

Bindings are operator-controlled. Pause workers before changing them; provision an explicit customer/invoice → test Engagement mapping and select exactly one current invoice per Engagement. Customer ID alone is not sufficient. No mappings exist remotely yet.

Server configuration (all server-only):
- `PAYMENTS_TEST_ENABLED=true` (otherwise startup refuses)
- `STRIPE_TEST_KEY`, `STRIPE_TEST_SIGNING_SECRET`
- `PAYMENTS_DATABASE_URL` (dedicated least-privilege login, TLS required in deployment)
- `ATTIO_GROWTHCAST_KEY`
- `PORT` (default 8080)

No secrets in Docker build arguments or source. The reference server route is `POST /stripe/test`. Unknown routes/methods return 404. Production/live mode is unsupported.

## Verification

```sh
docker build -t growthcast-payments-test payments
# Ten pure tests pass; DB test skips unless TEST_DATABASE_URL is supplied.
# Run integration test against a NEW disposable Postgres 17 database on a private Docker network:
docker run --rm --network <test-network> -e TEST_DATABASE_URL=<disposable-test-url> growthcast-payments-test npm test
```

Integration test applies the migration to an empty DB and uses a restricted LOGIN role for all worker operations. It covers 12 concurrent duplicate requests, identifier conflict, quarantine, recovery preview/execution after Attio read-back failure and noncurrent invoice protection. Binding writes by the worker and receipt reads by an unrelated browser role are denied. Do not run against the hosted project or any populated database. Test Stripe/Attio clients are mocks: real remote delivery, permissions and amounts are not independently verified by these tests. No external API or secret is needed for tests.

Outstanding: remote Attio read-back fixtures, source SDK API-version compatibility, deployed TLS/role verification, bounded retry/dead-letter scheduling and alerts, and deployed integration checks. Adapter limits raw-body reads to five seconds and 256 KiB, and initializes external clients only after valid signatures. Recovery is bounded per invocation but repeated scheduled attempts/backoff are not yet configured. Keep disabled until these and migration review pass. Rollback before deployment is just leaving the endpoint absent; after a separately approved rollout, disable the Stripe subscription/receiver and preserve receipts rather than dropping tables.
