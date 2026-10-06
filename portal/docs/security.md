# Threat model and signing feasibility

Status: Phase 1 technical gate passes in the bounded pinned local spike; overall acceptance remains conditional on licensing decisions. See [the acceptance review](phase-1-acceptance.md). This is a GrowthCast compatibility finding against a bearer-link design, not a claim of a newly disclosed upstream vulnerability.

## Reproduced blocker

At Documenso `389390c884949fe27c240488a3259da3cdba93e0`, the route:

```text
GET /api/files/token/:token/envelope/:envelopeId/envelopeItem/:envelopeItemId/dataId/:documentDataId/:version/item.pdf
```

queries the item using the recipient token, envelope ID, item ID and data ID, then calls `handleEnvelopeItemPdfRequest`. It does not call recipient access-auth or guest-session validation. The actual response helper returns PDF bytes with `Cache-Control: private, max-age=31536000, immutable`. Correct IDs plus token are therefore sufficient at this route boundary; configuring ACCOUNT or TWO_FACTOR_AUTH elsewhere does not add a check to this code path.

The [13-test harness](../spike/token-boundary.check.mjs) executes both original route files with real validators and the original response helper. It replaces database/storage/session infrastructure with synthetic fixtures. Correct tokens return 200 for current/initial PDF, HEAD and Range; incorrect token/envelope/item/data are denied. The corresponding account route rejects an anonymous request. This isolates the token route behavior; it is not a full deployed attack or a cryptographic-signature test.

Static follow-through: `server/router.ts` mounts files at `/api/files`; `server/middleware.ts` skips page handling for `/api/`. The older `/api/files/token/:token/envelopeItem/:envelopeItemId` and `/download/:version?` paths in `files.ts` also use bearer token lookup. QR, embed, completion, certificate/audit, tRPC, data loaders and legacy document paths must all be inventoried for the gateway; no claim of exhaustive coverage is made yet.

Primary evidence: [token route](https://github.com/documenso/documenso/blob/389390c884949fe27c240488a3259da3cdba93e0/apps/remix/server/api/files/routes/get-envelope-item-pdf-by-token.ts), [PDF helper](https://github.com/documenso/documenso/blob/389390c884949fe27c240488a3259da3cdba93e0/apps/remix/server/api/files/routes/get-envelope-item-pdf.ts), [auth types](https://github.com/documenso/documenso/blob/389390c884949fe27c240488a3259da3cdba93e0/packages/lib/types/document-auth.ts).

## Threats and acceptance evidence

| Threat | Required control | Evidence needed before release |
| --- | --- | --- |
| Copied provider token/origin bypass | Session-enforcing signing gateway and private provider ingress | Fresh browser/direct-origin/API/PDF access denied after handoff, expiry and revocation |
| Cross-client ID substitution | Immutable client/project/version/recipient binding at every read/write | Two clients in one organization; two organizations; active-org switching; native route tests |
| PIN brute force and fixation | Argon2id, distributed atomic limits, session rotation, fail-closed dependencies | Replica-spanning failures and limiter outage deny access; no permanent attacker-induced lock |
| CSRF or replayed handoff/claim | Exact Origin, session CSRF, atomic consume, short expiry | Concurrent consume: one winner; forwarded/wrong-email/cross-client claims denied |
| Uploaded HTML exfiltration | Allowlist sanitizer; isolated sandbox; CSP; no network; bounded assets/resources | Malicious CSS/SVG/URLs/forms blocked in Chromium; parent/session unavailable |
| Mutable accepted document | Immutable version/source/render/PDF hashes; approvals bind version | Upload change invalidates unsent approval, cannot overwrite signed bytes |
| Duplicate remote send/charge | Durable inbox/outbox, unique effect keys, read-back before uncertain retries | Crash after provider success causes reconciliation, no duplicate obligation/mail |
| Stale webhook regressions | Authenticated receipt, scoped binding and authoritative read-back | Duplicate/out-of-order completion, refunds and ACH returns converge |
| Cache/index/analytics leakage | no-store, noindex, no public sitemap, no replay; token-safe logs | Anonymous errors/HEAD/Range/CDN/browser cache tests and built-asset/log scan |
| Unsafe startup/data loss | Reviewed migrations, separate migration role/job, startup refuses drift | Restore and additive upgrade tests on disposable databases |
| Egress/SSRF and signing-key theft | Default-deny egress, blocked metadata/internal destinations, isolated renderer/key mounts | DNS rebinding/IPv6/redirect attempts fail; renderer has no host/provider credentials |
| Premature legacy cutover | Private provenance manifest, visual/legal acceptance, exact route changes | Both slash variants and direct API/download paths protected; per-client rollback verified |

## Gateway spike revision

The fallback gateway is already contemplated by plan section 6. This revision makes its acceptance scope concrete; it does not weaken PIN requirements or authorize a redirect-only implementation.

1. Run Documenso only on an internal network. Publish no provider port, alternate hostname or public object-storage URL. An edge proxy exposes the proposed signing origin; admin/API-key ingress is separate and staff-only.
2. After portal grant validation, create a random one-use handoff with a hashed stored token, recipient/envelope/version binding, expiry and revocation generation. Redeem atomically on the signing origin and issue a Secure, HttpOnly, host-only session. Never use shared `.growthcast.app` cookies. Strip the handoff from the browser address before provider rendering and never log it.
3. Use an explicit route inventory from a synthetic signing session, including loader/data/tRPC requests, static resources and final PDFs. Unknown dynamic routes/methods fail closed. Public static resources must be demonstrably free of private metadata.
4. On every private upstream request validate current grant/session/version/recipient/revocation in durable storage. Match every URL/query/body recipient token and envelope/item ID to server-side bindings. Reject mixed-recipient batch calls and attacker-supplied auth headers/cookies; a broad authenticated reverse proxy is insufficient.
5. Require CSRF and exact Origin for mutations, restrict redirects to approved destinations and overwrite private response cache/referrer/index headers. Support HEAD/Range through the same authorization path. Fail closed on store outage; no stale authorization cache after revocation.
6. Prove native license-supported embedding and certificate signing without bypassing enterprise checks. If the SDK requires exposing reusable tokens, verify that those tokens have no reachable route outside the session boundary.
7. Exercise two recipients, sequential and parallel order, client sign then countersign, rejection, expiry and revoked sessions. Download and cryptographically verify the sealed artifact and audit record. Account signup must remain optional for this entire flow.
8. Replay each recorded request with no cookie, wrong signer, altered IDs, expired handoff and revoked grant, including direct provider origin/storage. Only after these tests pass may Phase 2/full portal work begin.

A local-only gateway is now implemented under [`portal/gateway`](../gateway/README.md), with real disposable PostgreSQL, a private Documenso container, email sink, local test certificate and native desktop/mobile signing evidence. The local rejection, restart and native-session revocation runner now passes. Final sealed-artifact IDs are reconciled through a trusted hash-checked step because native sealing replaces the source data ID. The native full-page handoff and official React SDK now pass on separate same-site local origins with unchanged provider claims/branding. This does not establish production white-label entitlement or exhaustive adversarial coverage. The bounded Phase 1 engineering gate is now supported by the acceptance review; commercial sign-off remains open, and this fixture is not a deployable production gateway.
