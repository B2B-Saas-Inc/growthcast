# Atrium integration contract

Pinned source: `Vibra-Labs/Atrium@1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2`. This contract is exercised by the isolated [compatibility harness](../atrium-spike/README.md). It now loads the full AppModule and supports a combined local Documenso completion/PDF/catalog runner; production application integration is not implemented.

## Identity and account claims

Atrium's disabled-signup mode permits a pending invited email to register. Better Auth can issue that new, unverified user a session. Neither a successful signup, an email string match, nor a signature iframe event can authorize a claim.

The claim operation must require a current verified account identity, recipient binding and an explicit approved client/project scope. In a single durable transaction, consume a one-use claim tied to the gateway grant, approved document version and provider recipient; record the link and minimal membership with an audit event. Reject wrong email, organization/client, stale generation, expired/replayed claims, and revoked grants. Do not create organization-wide access merely because an email matches. Signing must continue to work if account creation fails.

A proposed default is to offer account access after full execution, subject to the plan's unresolved operator decision. Do not silently select client-signature completion as the release trigger. Email delivery and production identity assurance remain unverified.

## Documents and signing

Reuse the Atrium document catalog and file metadata after adding explicit provider ownership and immutable version associations. Atrium's native signing token is associated with an existing user and is reusable. Do not expose its `sign-via-token` routes as the GrowthCast guest boundary or attempt to convert a gateway PIN into an Atrium native token.

The local ownership adapter now rejects native signature/response/finalization, native bearer-token and direct-file routes for registered provider documents through the compiled Atrium controllers. Database triggers also prevent native writes. These protections are wired through the local full AppModule overrides; production wiring remains necessary; hiding buttons alone is insufficient. Guest HTML/PDF, SDK requests and all downloads must resolve through the durable scoped gateway or equivalent authorization layer. Token validity alone is insufficient: native validation can still return metadata after project assignment removal, even though file/signing-info methods recheck assignment.

For authenticated users, resolve the current organization, client/project assignment, claimed recipient and document version before handing off to the gateway. Revocation or membership removal must invalidate access immediately; use durable checks rather than trusting a cached session. Preserve the SDK fixture's host-only cookie, approved frame ancestor, wrong-origin message rejection and completion-pending behavior. Canonical provider read-back plus sealed artifact verification owns completion. The browser completion event owns only UI state.

The focused HTTP slice now boots the actual Atrium auth controller, session middleware and auth/CSRF guards with synthetic users across two clients and a second organization. Eleven checks cover verified claims, one-use handoffs, missing validator, removed memberships, expired sessions, revoked grants and source version/file-ID replacement, including actual gateway HTTP denial. The later follow-up now loads the complete Atrium AppModule with synthetic external transports; this is not exhaustive coverage of all its routes. The provider-ownership follow-up now adds compiled document/file/invoice/payment controllers, thirty native-route probes and worker/database denials. The new catalog and real-login/HTTPS handoff now pass desktop/mobile browser checks in the actual Next.js layout. The default destination remains synthetic; the combined provider mode now uses a real local completed Documenso envelope and hash-matched sealed PDF. A trusted readback adapter records full execution and sealed-artifact evidence atomically in an append-only side table, without changing the native read-only document. The local lifecycle follow-up now uses a restricted function-only worker role and durable leased reconciliation queue. The next local follow-up adds separate random SCRAM credentials, an isolated worker container and Ed25519 verification receipts. Production still needs managed secret/trust-key provisioning, non-owner application roles and remaining route/background-task audits. The present fixture does not satisfy the production gate.

## Stripe ownership

Native Atrium invoices and one-time Checkout are not the plan's Stripe Invoicing adapter. Preserve integer-cent storage, but add an explicit canonical Stripe invoice association and read model. The local adapter now rejects native Checkout creation, Checkout webhook projection, manual paid-state changes and native invoice PDF generation for registered provider invoices. Database triggers preserve that read-only state; the canonical writer is not implemented. A future scoped projection mechanism must preserve Stripe ownership without a global trigger bypass.

The current event service marks a local invoice paid on `checkout.session.completed` without checking `payment_status`. This was reproduced with a synthetic unpaid event, not a real provider callback. The replacement worker must authenticate webhooks, durably deduplicate events, verify account/organization ownership and reread the canonical Stripe Invoice before projecting balance/status. Payment success redirects and Checkout completion alone are not accounting authority. Test delayed payments, duplicate/out-of-order events, refunds, partial payments, voids, credits and reconciliation outages using approved Stripe sandbox resources before accepting Phase 6.

## Deployment prerequisites

The upstream checkout has no migration history alongside its Prisma schema. The disposable empty-schema SQL is characterization infrastructure, not a production rollout. A fork needs a reviewed baseline, explicit migrations and tested backup/restore/rollback. Review upstream blanket proxy trust and request-URL logging before placing bearer routes behind a production ingress. Resolve the exact hosting/license arrangement, signing certificate trust and account invitation trigger before release. These checks neither purchase licensing nor authorize deployment, billing or client cutover.


## Phase 2 restricted application role

The foundation now runs the shared claim/catalog logic and gateway store under `gc_app` with verified PostgreSQL TLS. Account handoffs use `copy_account_artifacts` instead of direct sealed-artifact inserts. The function rechecks account/source/child scope, copies only canonical references, uses a fixed search path and has no PUBLIC execute grant. See [foundation evidence and limits](../foundation/README.md). The older combined live-provider/browser fixture retains its existing identity; do not confuse that evidence with a complete restricted-role production stack.


The combined real-provider/browser HTTP gateway now uses `gc_gateway` with a separate SCRAM credential, narrowly scoped table/column privileges and no owner/lifecycle secret mount. Its application/seeding fixture still uses the older owner identity. See the [gateway role contract](../atrium-spike/README.md#dedicated-gateway-database-role) before consolidating this harness with foundation TLS and migrations.


The combined harness now consumes the foundation migration manifest and enforces verified PostgreSQL TLS for Prisma and gateway/lifecycle stores. Its HTTP component graph uses `gc_app`; only the test driver’s separate clients retain owner authority for fixture construction/failure injection. This is a database-client boundary inside the test process, not proof of production process isolation. Runtime entrypoints guard schema state; provisioning/migration is a separate job.


The HTTP component graph now runs in its own `api` container, separate from the privileged driver. Next.js and browser-edge API traffic target that container. Startup asserts the absence of privileged fixture mounts and verifies the restricted database identity/TLS/denials. The driver consumes captured test mail and side-effect snapshots through a read-only volume; there are no test-control HTTP endpoints. Synthetic service adapters and the local test auth secret still prevent treating this as a production deployment.
