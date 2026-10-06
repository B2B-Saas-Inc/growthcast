# Phase 1 acceptance review — 2026-09-23

**Engineering verdict: PASS for the pinned local compatibility/security spike. Overall Phase 1 disposition: CONDITIONAL, with two licensing decisions still open.** This is not production readiness, a legal entitlement determination, or permission to deploy/send client documents.

The authoritative gate is Phase 1 in the Desktop implementation plan: accountless signing works and anonymous direct-token/PDF bypass fails. Native Documenso bearer access fails that requirement; the scoped signing gateway meets it in the tested configuration. Production infrastructure is assigned to Phase 2 rather than added indefinitely to this spike.

## Configuration and decision

- Atrium: `1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2`.
- Documenso inspected source: `389390c884949fe27c240488a3259da3cdba93e0`, v2.18.0; tested ARM64 image: `sha256:615d0e79047ff9615dc86092bf9a6ba021750ee3895f440621e94477b581b183`.
- Official React embed SDK: 0.6.2. No paid claims, branding removals or license checks were bypassed.
- Synthetic PDFs/recipients; disposable databases and captured email; database-backed provider files; internal Docker networks without published provider ports. Chromium desktop/mobile; local test signing/TLS certificate.
- **Select the gateway architecture.** Native recipient tokens are not the GrowthCast authorization boundary. All provider data, signing, SDK and PDF requests pass through durable grant/session checks. Provider ingress stays private; handoffs are one-use and recipient/envelope/version bound, with host-only signing cookies.

Image/source equivalence has not been established through a reproducible source build. This review records both pins rather than claiming provenance that was not proved.

## Acceptance evidence

| Requirement | Disposition and evidence |
| --- | --- |
| Isolated synthetic environment | Pass; disposable containers, databases, mail sink and test certificate, with no production sends or host provider ports. |
| Atrium implementation characterized | Pass; original 11 auth/document/payment cases plus 28 integration cases. Native invoice semantics and unverified signup behavior are documented findings, not adopted production behavior. |
| No-signup PIN signing | Pass; API-created envelopes, salted Argon2id PINs and one-use handoffs; provider database confirms no signer accounts were created. |
| Recipient/client/organization scope | Pass; two recipients, two clients in one organization and a second organization; mixed-recipient and substituted-ID requests rejected. |
| Native and SDK flow | Pass; sequential and parallel countersigning, rejection, official SDK callbacks, separate same-site origins and wrong-origin/frame denial. |
| Final PDF verification | Pass; all four terminal artifacts verified with OpenSSL against the disposable certificate, with final ByteRange covering the final revision. This does not establish public/legal signing identity. |
| Copied-token/direct-origin bypass | Pass; anonymous captured requests and direct completed-PDF URLs denied; browser edge cannot reach the private provider service. This configuration has no external object-storage URL. |
| Replay, expiry and revocation | Pass; 32 PostgreSQL/HTTP/PIN/policy cases, including handoff expiry, generation changes, atomic consumption, CSRF and outages; full captured-request replay also denied with expired sessions and revoked grants. |
| Restart persistence | Pass; existing sessions and current sealed PDFs remain accessible after gateway restart. |
| Alternate route inventory | Pass; 588 denial probes: 504 GET/HEAD requests with Range headers across 18 alternate-route/substituted-ID forms and anonymous/valid-session contexts, plus 84 current sealed-PDF cross-recipient GET/HEAD/Range probes across seven saved sessions. |
| Real catalog handoff | Pass; 39 Atrium cases and desktop/mobile login → catalog → signing gateway → hash-matched sealed PDF. Restricted worker, SCRAM isolation and signed verification receipts exceed the original spike gate. |
| License/edition decision and price | Open; see the two concrete decisions below. |

The final gateway run denied 45 anonymous, 270 wrong-recipient, 45 expired-session and 45 revoked-session captured-request replays. The combined Atrium/browser run also passed all 39 cases and current sealed-PDF hash checks. The 13 source-pinned characterization cases still reproduce why native bearer access cannot be used directly.

The expiry drill snapshots original fixture session expiry timestamps, expires sessions while grants stay valid, and then restores exactly those timestamps. It never extends a session lifetime. A second positive-access check proves revocation tests are not accidentally passing merely because the sessions remained expired.

### Route review boundary

The expanded matrix covers legacy token file/download routes, QR-token-shaped routes, account/presigned file variants, provider envelope/audit API routes, certificate-status and internal audit/certificate render routes, direct-template/multisign/authoring embeds, unapproved sign data loaders, unapproved document tRPC and substituted envelope/item/data IDs. It probes both anonymous requests and valid sessions. Native sign/completion and exact current PDF positive controls remain accessible to the correct session.

Source review confirms provider assets and manifests pass through authorization before the allowlist; the public gateway entry/PIN JS and CSS are fixed strings without document metadata. Unknown routes and methods fail closed. The permitted recipient embed data and manifest dependencies are narrow and exercised by the SDK. Mutation origin/CSRF and mixed-batch behavior are covered by the existing HTTP/policy tests.

This is a bounded review of the pinned spike, not an exhaustive vulnerability assessment of every upstream application route, browser engine or future storage driver. New provider routes, upgrades or storage transports require fresh review.

## Audit-log finding

The audit download is an API-key/team-authorized, generated PDF. At the pinned source, `apps/remix/server/api/download/download.ts` calls `generateAuditLogPdf` and saves it; `packages/lib/server-only/pdf/generate-audit-log-pdf.ts` renders database audit events and merges pages without a signing operation. The live runner now saves each generated audit export inside the disposable volume, checks its PDF header and confirms absence of a PDF signature ByteRange.

**The sealed contract is cryptographically verified; the separate audit-log export is not independently signed or attested.** A hash or our receipt for the contract does not authenticate historical audit events. The earlier gateway-revision wording requested cryptographic verification of both; that stronger audit-record assertion is not satisfied and must not be reported as a pass. It is outside the original Phase 1 gate. Decide audit retention/attestation requirements during signing implementation and release acceptance (Phases 4/7).

## Remaining licensing decisions

1. **Atrium agency-client hosting.** The pinned [Atrium ELv2 license](https://github.com/Vibra-Labs/Atrium/blob/1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2/LICENSE) restricts hosted/managed offerings exposing substantial functionality. Elastic's [official FAQ](https://www.elastic.co/licensing/elastic-license/faq) distinguishes limited application use from substantial access; it does not determine Atrium's permission for this particular client portal. Record an applicable determination or permission for GrowthCast's client-facing documents/accounts/invoices/project UI. No licensor correspondence or approval has occurred.
2. **Documenso edition, branding and price.** [Self-hosting documentation](https://docs.documenso.com/docs/self-hosting) describes core AGPL functionality and enterprise feature keys. The pinned [commercial license](https://github.com/documenso/documenso/blob/389390c884949fe27c240488a3259da3cdba93e0/packages/ee/LICENSE) distinguishes testing from production use of covered enterprise code. Confirm which edition covers the intended self-hosted SDK/branding/certificate arrangement and its actual fee. The local tests preserve existing branding and claims; working code alone is not proof of production entitlement. Record AGPL corresponding-source/notice obligations where applicable.

Current official pages rechecked on 2026-09-23:

| Published offering | Price shown | Applicability |
| --- | --- | --- |
| Hosted Teams, embedded signing | $40/month billed annually ($480/year) | Hosted service price only. |
| Hosted Platform, white-label embedded signing | $250/month billed annually ($3,000/year) | Hosted service price only. |
| Self-hosted Community | Free tier; no enterprise feature set | Marketing positions it for testing/evaluation/internal POCs; this is not itself a legal interpretation of the AGPL license. |
| Self-hosted Business / Enterprise | Yearly license / tailored price; no numeric quote published | Exact GrowthCast production entitlement and cost remain unknown. |

Sources: [hosted pricing](https://documenso.com/pricing), [self-hosted edition matrix](https://documenso.com/self-hosted). The self-hosting documentation and marketing positioning do not resolve the exact intended production arrangement. No quote was requested, purchase made or message sent.

A concrete unsent clarification brief is: GrowthCast will operate an agency-client portal, retain upstream notices, offer accountless recipient signing through a private-provider/session gateway, and use the official React SDK. Confirm permission for the client-facing feature set, ordinary versus white-label embedded signing, required edition/hosts and annual license/certificate cost. This report does not infer authorization to send that brief.

## Handoff to later phases

- Phase 2: non-owner application roles, managed secrets and trust-key rotation, database TLS, reproducible builds, reviewed migrations, persistence/restore, production ingress and egress.
- Phases 3/3A/3B: actual guest/client routing, internal search, staff approval and private HTML/PDF proposal workflow.
- Phase 4: production lifecycle/claim integration, invitations and audit evidence policy.
- Phases 5/6/6A/7: Attio, canonical Stripe invoices, proposal migration and release/pilot acceptance.

Those items do not retroactively expand the bounded Phase 1 technical gate. Resolve the two commercial decisions to close Phase 1 overall; production deployment remains separately gated.

## Reproduction

```sh
sh portal/spike/run.sh /absolute/path/to/pinned-documenso-checkout
PORTAL_ATRIUM_CHECKOUT=/absolute/path/to/pinned-atrium-checkout sh portal/gateway/run.sh
docker build -t growth-model .
```

No host packages are installed. Fixtures, credentials, PDFs and raw bearer-route captures remain in disposable volumes. Only named synthetic screenshots and redacted route inventory leave the containers, in ignored artifact directories. Official-page extracts are saved in ignored `.firecrawl/phase1-*.md`; durable claims link directly to primary sources above.


## Bounded Phase 1 acceptance — 2026-09-23

The [acceptance review](phase-1-acceptance.md) is the current status reference. Engineering verdict: PASS for the pinned local spike; overall Phase 1 remains CONDITIONAL on Atrium agency-client hosting applicability/permission and the intended Documenso self-hosted edition/entitlement/price. No production authorization is implied.

Added 588 alternate-route/substituted-ID/current-sealed cross-recipient denial probes and full expired-session replay. The final gateway runner denied 45 anonymous, 270 wrong-recipient, 45 expired and 45 revoked captured requests, with positive access restored between expiry and revocation without extending original lifetimes. The combined run passed 39 Atrium cases and browser PDF access; the gateway suite passed 32 cases; the native-boundary characterization still passes 13 cases by reproducing the native incompatibility.

Source review and live audit PDF inspection establish that separate audit exports are generated and unsigned. Sealed PDFs are cryptographically verified; no independent audit-event attestation is claimed. This limitation from the expanded spike wording is recorded explicitly and handed to Phases 4/7 policy/implementation. Production key management, TLS, application database roles, migrations/restore and ingress belong to Phase 2 rather than expanding the original Phase 1 technical gate.

Official licensing/pricing pages were rechecked with Firecrawl. No self-hosted numeric Business/Enterprise quote was published on the inspected page; hosted Teams/Platform prices are not self-hosted entitlements. No vendor message, license purchase or deployment was performed.


The [bounded Phase 1 acceptance review](../docs/phase-1-acceptance.md) now records the technical result separately from commercial sign-off. The runner includes a 588-probe alternate-route/current-artifact boundary matrix and full expired-session replay, restores only original fixture expiry timestamps, checks positive access again, and then tests revocation independently. Separate generated audit PDFs are confirmed unsigned; signed contract PDFs retain their independent OpenSSL verification.
