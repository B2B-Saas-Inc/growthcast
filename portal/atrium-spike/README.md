# Atrium compatibility characterization

This disposable harness executes the pinned Atrium AuthService (including the real Better Auth HTTP handler), DocumentsService and PaymentsService against PostgreSQL. It also runs the focused HTTP follow-up described below. It is not an Atrium fork, a deployed portal or Stripe sandbox acceptance. The optional browser mode below adds a locally built Next.js catalog and real login/handoff checks.

```sh
sh portal/atrium-spike/run.sh /absolute/path/to/atrium-checkout
```

The runner requires clean tracked source at `1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2`. It exports only committed files, uses digest-pinned Bun 1.3.9 and PostgreSQL 17 images, installs with the upstream frozen lockfile inside Docker, and preserves upstream source/license files. No host dependencies or upstream edits are needed. The internal Docker network publishes no ports and has no external egress. Mail, billing initialization, storage and the injected Stripe transport are synthetic; no keys, remote events or real documents are used. Test execution runs as the image's unprivileged Bun user.

The inspected source has a Prisma schema but no checked-in migration directory. The image regenerates SQL from the pinned schema and checks it against the foundation baseline. An explicit provisioning/migration job refuses nonempty public schemas, creates separate identities, and applies the foundation’s checksummed migrations over verified TLS. Runtime entrypoints perform a read-only schema check and never run migrations. The test database remains disposable; this is not an upgrade path for an existing installation. The runner removes its own containers/network and in-memory database on exit. Cached Docker images remain available for repeat runs.

The checks deliberately assert incompatible behavior as well as working controls. A green result reproduces these boundaries; it does not make them suitable for release:

- Closed signup blocks an uninvited email. An invited user can receive a session while `emailVerified` remains false. A logged-in session alone is insufficient for the plan's verified document claim.
- Native document token creation requires an assigned existing user and matching organization. Stored tokens are hashed, but the raw bearer token is reusable without a PIN. Explicit revocation and expiry deny access.
- Token validation continues returning document metadata after project assignment removal. The separate file and signing-info services still deny that removed client. Do not generalize the metadata observation into PDF access.
- Checkout rejects an unassigned client and foreign redirect origin; configured payments are required for the requested organization. The native successful path creates `mode=payment` Checkout, with integer-cent line items and connected-account scope, and reuses an open session. It does not create an authoritative Stripe Invoice.
- The payment event service rejects a mismatched verified organization and suppresses duplicate paid notifications. A synthetic `checkout.session.completed` event with `payment_status=unpaid` still marks the local invoice paid. This test calls the event service after the signature-verification boundary; it does not test webhook signature validation or assert a real Stripe event occurred.

The required changes and remaining acceptance work are in [the integration contract](../docs/atrium-integration.md). The original eleven characterization checks do not establish whole-app tenancy, concurrent checkout creation, actual Stripe delayed payment events, account invitation acceptance or browser navigation. The separate HTTP checks below add scoped verified-claim and gateway evidence.

## Verified-account HTTP follow-up

The same runner now also starts a focused Nest application with the **actual upstream AuthController, SessionMiddleware, AuthGuard and CsrfGuard**, plus the local claim controller. Eleven additional checks exercise HTTP signup, active-organization selection, the real emailed verification URL captured in the local mail fixture, and a PostgreSQL-backed one-use claim. The runner follows an active-organization change with `get-session` to refresh the upstream middleware cache; the cached organization otherwise can remain stale during the 30-second cache window. No upstream cache code is changed.

A trusted fixture provisions a claim only for an explicitly bound synthetic completed document. The claim token is random and hashed at rest, expires within ten minutes and is consumed under a row lock. Consumption, account-derived grant, 60-second handoff and audit row commit together. Concurrent claims produce one success. No browser can choose the client, organization, recipient or version. The adapter requires an existing organization membership **and** exact project assignment; it does not create memberships or send invitations. The synthetic `signed` document row is not evidence of canonical Documenso completion; production provisioning still needs the verified lifecycle worker.

The gateway store now recognizes account-derived grants and refuses them unless a durable account validator is provided. That validator rechecks the Atrium session, verified email, active organization, organization membership, project assignment, document version/file ID/status and original grant generation on every handoff redemption and private request. This avoids relying on Atrium's 30-second middleware cache. Guest PIN grants remain independent of accounts. Final-artifact aliases already reconciled on the original grant are copied to the derived grant.

Checks cover anonymous/unverified accounts, wrong client/organization/origin, missing CSRF, expired/replayed/concurrent claims, missing gateway validator, membership/project removal, session expiry, version/file-ID replacement and original grant revocation. A separate Node 24 container runs the real gateway HTTP handler with the same database validator. Authorized synthetic PDF GETs succeed and are denied immediately after membership removal, session expiry or file-ID substitution. The gateway's upstream is a synthetic PDF transport in this harness; the separate signing runner covers actual Documenso.

This test uses internal HTTP with an HTTPS Origin/Host contract and manually managed cookies. It **does not** establish browser Secure-cookie/TLS behavior for the combined Atrium-to-gateway flow; the previous native/SDK runner supplies separate browser/TLS evidence. This initial HTTP stage used a focused module; the later AppModule/browser follow-up below supersedes that wiring limitation. The provider-ownership follow-up below adds document/file/invoice/payment controller checks. At that stage real canonical completion remained outstanding; the subsequent catalog/browser and canonical completion evidence is recorded below. Exhaustive route coverage and account invitations remain open. The bridge lives only in the fixture; the standalone signing gateway refuses these account-derived grants by default.

## Provider-ownership boundary follow-up

The runner now builds Atrium's API with its own `nest build` script and loads the actual compiled Documents, Files, Invoices and Payments controllers, in addition to auth. The research checkout remains unchanged. Compiled output avoids a Bun runtime ambiguity around a type-only `UploadedFile` import in the upstream controller; the image retains the upstream frozen dependency lockfile.

Nine additional cases exercise a local provider-ownership adapter backed by separate registry tables. Provider document/invoice registrations are immutable in this fixture. A global guard denies native ID routes before upload interceptors or service side effects; public native bearer tokens are resolved by hash and denied for provider documents, including tokens created before registration. Direct file download/URL/mutation paths are denied for associated source, signed, version or uploaded-invoice files. Wrapped service entrypoints reject worker calls to native document actions, invoice mutations/PDF generation, Checkout creation and Checkout event projection. Ordinary native documents, token creation, invoice updates and Checkout remain usable.

PostgreSQL triggers add a write boundary on registered documents/invoices, related responses/signature fields/versions/tokens/line items and protected files. They reject attempts to remove ownership, mark records signed/paid, replace storage keys or move child rows out of provider scope. The fixture provides **no canonical writer bypass**; a future integration worker needs a separately reviewed, scoped projection mechanism. Never disable these triggers globally to implement reconciliation.

The suite now totals **31 cases**: eleven original characterization cases, eleven verified-account cases and nine provider-ownership cases. The added cases contain 30 real-controller route probes plus service/database checks. Tests assert no storage, Stripe or notification side effects on rejected actions. An ownership lookup outage returns a generic server error before native operations. All Stripe transport is synthetic.

At that stage the runner was still a focused module. The subsequent follow-up below loads AppModule and adds a bounded provider catalog UI. Provider-ID detail routes deliberately return 404 until their replacement adapters exist; the original project lists, search and the wider route surface still need exhaustive acceptance. The service wrappers must be installed for every caller in the eventual application. Dynamic adoption of a record while a native external operation is already in flight is not covered; production adoption must coordinate or drain that work. No existing client document/invoice is adopted by this fixture. The later completion follow-up adds an append-only Documenso projection; a canonical Stripe writer remains unimplemented.

## Full AppModule and browser catalog follow-up

The HTTP runner now imports Atrium's **full compiled AppModule** through Nest's testing module. Its registered controllers, session/preview middleware and global CSRF, plan, preview, throttle and exception handling are loaded. Overrides supply the existing ownership wrappers and synthetic mail/storage/Stripe transports. The test throttle limit is 1,000/minute; this does not validate production rate limits. These selected flows are not an exhaustive audit of every registered route or background task.

The new catalog returns only completed provider documents with a consumed claim for the current account, a matching provider envelope association, and live session/email/membership/project/version/file/grant authorization. Its DTO contains only document ID, title, type and completion label. Reopening rechecks authorization under a transaction and mints a new single-use handoff without consuming the original claim again. The local query considers at most the 100 newest consumed claims; production pagination/retention remains future work. Access still expires with the original one-hour fixture grant.

The runner now passes **33 API/database cases**. To additionally build the actual Next.js application with a small catalog/navigation overlay and run Chromium desktop/mobile verification:

```sh
PORTAL_BROWSER=1 sh portal/atrium-spike/run.sh /absolute/path/to/atrium-checkout
```

The overlay adds `/portal/documents` inside the upstream portal layout, uses the existing `apiFetch`/CSRF helper, adds a Documents link, and wraps the header on mobile. It is applied only to committed-source copies inside Docker. The upstream checkout and public GrowthCast site stay unchanged. The Next production build performs its own type checking; existing upstream Sentry configuration and Browserslist warnings remain visible.

An internal HTTPS edge serves `portal.growthcast.test:8444`; the signing handler serves `signing.growthcast.test:8443`. Browser tests use ephemeral self-signed certificates and `ignoreHTTPSErrors`; no production certificate trust is established. They perform real password login, navigate through the actual portal layout, verify the scoped catalog, open a document, and confirm fragment removal and Secure/HttpOnly host-scoped cookie isolation. Both 1280×850 and 390×844 views passed without horizontal overflow or JavaScript page errors. Anonymous navigation redirects to login; copied signing URLs and another verified client's reopen attempt are denied.

The default runner uses a synthetic destination. The combined provider mode below connects the same catalog to the separate real local Documenso signing runner.

Only the two catalog screenshots are copied to ignored `artifacts/`. Test credentials, cookies, handoffs and certificates remain inside disposable containers/volumes. Cleanup includes services in the browser Compose profile. No host packages or public ports are used. `playwright_validate` was not available, so verification used the existing digest-pinned Playwright container. Screenshots were visually reviewed.


## Canonical completion and sealed PDF integration

Run the complete local signing → cryptographic verification → Atrium claim/catalog → scoped PDF flow:

```sh
PORTAL_ATRIUM_CHECKOUT=/absolute/path/to/atrium-checkout sh portal/gateway/run.sh
```

This optional mode waits for the four real local Documenso envelopes to reach their expected terminal states, verifies their sealed PDFs with OpenSSL and reconciles immutable data IDs, then runs the Atrium browser suite against the completed sequential envelope. A read-only mount shares only disposable fixture state between the stacks; an internal GET/HEAD-only bridge connects the Atrium signing gateway to Documenso. No host ports or upstream checkout edits are required. Provider credentials and recipient tokens remain in disposable volumes; only the existing named screenshots/redacted route inventory are copied out.

`completion.mjs` rereads the canonical API and checks envelope/team/document/recipient/field/item identity, full execution, and the PDF hash against the independent signature-verification result. The trusted fixture maps the already approved source envelope to its local Atrium organization/project/version. This is a local integration mapping, not automatic adoption of arbitrary provider documents. Single-PDF envelopes are the deliberately bounded initial case. Download bodies have a 16 MiB limit. Wrong status, team, envelope, document, recipient, item or digest cannot produce a completion record.

Completion is an append-only side table, committed atomically with the sealed artifact alias after locking and checking the current grant, document and provider association. Duplicate identical readback is idempotent. Atrium's registered document remains `pending` and read-only; the new catalog uses canonical completion evidence to display Completed and authorize claims. No native status mutation or global ownership-trigger bypass is installed. Account authorization rechecks that completion and sealed-artifact records still agree. Existing unowned synthetic claim controls retain their earlier signed-status behavior.

The provider browser mode requires Documenso's actual Document Signed screen, downloads its final PDF through the authenticated gateway on desktop/mobile, compares bytes to the verified hash, and denies anonymous copies of the same PDF URL. This verifies transport using local test certificates, not legal certificate trust or production identity assurance. Native signing and SDK completion, rejection, restart and revocation checks still run in the outer harness.

The follow-up below adds a restricted local lifecycle role and durable polling worker. Production still needs credential/proof provisioning, scheduled operations, reviewed migrations, long-term catalog retention/renewal, exhaustive route/worker coverage and approved hosting/license/certificate decisions. The application and schema-setup fixtures still use the disposable database owner; this is not a release migration. Stripe canonical invoice projection remains unimplemented. Phase 1 remains open.


## Restricted lifecycle worker and durable reconciliation

The durable-worker stage added **37 API/database cases**; credential/receipt isolation below extends this to **39**. `lifecycle.sql` creates a separate `gc_lifecycle` login with no table access, schema creation or role escalation. It can execute only the three new lifecycle entrypoints: claim, retry and complete. These SECURITY DEFINER functions have a fixed search path, qualified table references and no PUBLIC execute permission. Existing Atrium/gateway web fixtures still use their original owner connection. The credential-isolation follow-up below replaces trust authentication in the Atrium database and separates the worker container and secrets. Production still requires managed credentials and non-owner application roles.

Trusted provisioning inserts a durable job keyed by source grant with its document, provider team and independently verified PDF hash. Repeated delivery is idempotent; a conflicting association or proof is rejected. No public webhook/HTTP enqueue route exists. Workers atomically claim eligible rows with `FOR UPDATE SKIP LOCKED`, a random lease token and a 60-second lease. Expired work can be reclaimed; stale leases cannot complete or retry a replacement worker's job. Completion rechecks current source ownership/version/revocation and approved PDF proof, then commits both immutable evidence tables and the done state together.

Failures retain only the category `readback-failed`, with exponential backoff and a five-attempt cap. A crash on the fifth lease is marked dead after expiry; it is never handed to a sixth attempt. Database outages leave the durable lease intact and the polling process retries later. Failed/dead jobs cannot produce a catalog claim. Dead-job operator recovery and metrics/alerting remain future work.

`lifecycle-worker.mjs` supplies a separate polling process, guarded to the restricted local database identity. The initial worker harness invoked it once in a child process; the credential-isolation follow-up now invokes it in a separate container to complete the actual catalog document; without `LIFECYCLE_ONCE=1` it polls every second and drains on SIGTERM/SIGINT. Provider calls retain the existing bounded timeout and PDF-size limits. Connection-loss/reclaim, concurrent-worker exclusion, stale completion, retry exhaustion, proof conflicts and permission denials are exercised against PostgreSQL. The combined runner still verifies real local signing and desktop/mobile hash-matched PDF access.

The worker's provider resolver and independent signature-proof input remain explicitly local fixtures. Production needs authenticated provider credentials, trusted proof generation/transport, reviewed non-owner application roles, a deployment scheduler and a migration/restore rehearsal. This implementation neither enables unverified webhook payloads nor treats a browser completion event as canonical evidence. Phase 1 remains open.


## Worker credential isolation and signed verification receipts

The Atrium database now requires SCRAM-SHA-256 on TCP connections. A disposable bootstrap container generates separate random owner and lifecycle passwords directly into Docker volumes. No password is stored in source, passed on a command line, printed, or copied to host artifacts. Startup waits for credential generation; the lifecycle role password is installed by the schema bootstrap. Missing, incorrect and cross-role passwords are explicitly denied.

The catalog's actual reconciliation runs in a separate read-only worker container. It receives only its own database credential, a read-only provider configuration volume, and a small writable readiness/result volume. It has no owner credential, gateway/browser runtime, provider runtime or signing private-key mount. Its startup checks prove those mounts are absent and that its password cannot authenticate as postgres. It cannot reach the provider's database network; the existing internal GET/HEAD-only bridge supplies canonical provider readback. The worker config contains just the selected team's API credential, approved binding and public verification material. The application test harness retains owner privileges for setup/assertions; non-owner application roles remain a production gate.

After OpenSSL verifies each final PDF against the local test certificate, the separate verifier signs a bounded Ed25519 receipt containing the PDF hash, provider team, envelope, document, item/data IDs, terminal status, audience, local-test environment and a one-hour validity window. The receipt-signing private key exists only in that verifier process. Its public key and selected receipt are delivered through trusted configuration; the worker never accepts a key embedded in a receipt. Canonical readback must still match the attested data ID and PDF hash. Browser callbacks and unsigned hash files are not accepted as receipt substitutes.

The suite now has **39 API/database cases** (11 characterization + 28 integration), including signature tampering, untrusted keys, expiry/future timestamps and correctly signed scope/audience/environment substitutions. The default runner uses explicitly synthetic signed receipt fixtures; only the combined runner derives receipts from cryptographically verified real local Documenso PDFs. Both modes exercise the separate worker container and SCRAM boundary.

This is local credential and proof-transport verification. Production still needs secret-manager provisioning and rotation, an authenticated verifier trust-key registry, certificate identity/trust policy, durable proof issuance/storage, TLS database transport, non-owner application roles and reviewed migrations/restore. The outer disposable Documenso signing stack still uses its earlier private trust-authenticated database; these changes harden the Atrium/worker stack. No production credentials, remote sends, deployments or client cutovers were performed. Phase 1 remains open.


## Dedicated gateway database role

The HTTP gateway now runs as `gc_gateway`, with its own randomly generated SCRAM password and read-only credential mount. It has no database-owner or lifecycle credential mounts. The fixture initializer creates the role and grants; the gateway waits up to 60 seconds for provisioning, verifies its identity and denial boundaries, then opens its HTTP/HTTPS listeners. Startup performs no DDL.

The role reads only the tables needed for durable authorization, inserts gateway sessions, and updates only `handoffs.consumed_at`. PostgreSQL requires an UPDATE privilege to lock grants during redemption, so it receives `UPDATE(binding)` solely for locking. The existing immutable-binding trigger forbids any actual binding change. It cannot change grant expiry, generation or revocation, delete grants, write canonical artifacts/completions, invoke the account artifact-copy function or assume the owner role. The focused tests exercise both permitted locking and denied authority changes.

The test driver still holds owner credentials to construct deliberately invalid/native records and canonical test state. HTTP components run in the separate `api` container with `gc_app` Prisma/store clients. The privileged driver is a different container/process and mounts API evidence read-only; its owner/migration/worker/provider credentials are absent from the API. This proves the local fixture boundary; production mail/storage/secret configuration is still pending. The gateway receives neither owner nor migration credentials. The combined harness now shares the foundation’s versioned migrations and verified database TLS. No production deployment is implied.


## Shared migrations and database TLS

The explicit `initialize` job provisions roles with generated SCRAM passwords, then switches to `gc_migrate` to apply the reviewed manifest and check idempotence. Migration credentials are mounted only there. Migration 005 supplies the narrow gateway grants and read-only schema metadata access for the gateway/lifecycle roles; the first four migrations are unchanged. The previous inline startup initializer has been removed.

PostgreSQL rejects plaintext host connections. Its private test key is mounted only in the database and certificate-generation container; application, gateway and worker receive only the public CA. Prisma uses strict certificate verification; gateway/worker stores use an explicit CA with hostname verification. Runtime startup checks the manifest and catalog fingerprint before starting its child. The certificate/credential setup preserves existing material when Compose starts additional services. Test certificates remain short-lived and disposable, not production signing credentials.

Application HTTP services, auth, catalog, claims and ownership guards use `gc_app`; fixture construction and intentional failure injection use privileged clients only in the separate driver container. Real-provider browser coverage verifies the components’ database role, TLS, denied DDL/canonical writes and continued catalog/handoff behavior. The separate API process now refuses privileged fixture mounts at startup. Production still needs managed secrets, real service adapters and completed staging topology.


## Isolated API process

`api-runtime.mjs` provides the shared component graph for the HTTP server and direct-service negative controls. Only `api-server.mjs` starts the API listener; `http.check.mjs` remains a separate test driver and sends HTTP requests to `api:3001`. Next.js and the browser edge also target `api`, never the driver.

The API has a read-only root filesystem, a private temporary directory, dropped capabilities, no-new-privileges and three mounts: its application credential, public database CA and disposable API evidence. It rejects owner, migration, worker, gateway, provider, database-key and shared browser-runtime mounts before starting. It verifies `gc_app`, TLS and DDL/canonical-write/role-escalation denials. The driver receives the evidence volume read-only; it cannot inject callbacks or modify captured mail/counters. Mail and side-effect snapshots are written atomically, and only captured test mail is used. No test-control HTTP route is exposed.

The API still uses explicit synthetic mail/storage/payment adapters and a test auth secret. It is a repeatable isolated integration runtime, not a production release image. Replacing those adapters and wiring managed secrets remain Phase 2 work.

## Mounted auth secret and staging SMTP capture

The isolated API and direct-service test driver read a random 32-byte hex auth secret from a dedicated read-only volume. The runtime rejects a missing/malformed secret instead of using a fixed fallback. Verification mail uses the existing pinned upstream Nodemailer dependency and a digest-pinned internal Maildev service. Only `example.test` and `growthcast.invalid` recipients are permitted. No outbound relay or published mail ports are configured; the service is attached only to the internal network. HTTP checks read the actual captured SMTP messages. Test-driver evidence remains read-only. These local credentials and SMTP capture do not configure managed production secrets or delivery.
