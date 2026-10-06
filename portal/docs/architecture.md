# Client portal architecture decision record

Current licensing status: resolved by the [operator confirmation on 2026-09-23](licensing-decision.md), superseding earlier open licensing questions recorded below. Infrastructure and deployment acceptance remain separate.

Date: 2026-09-22. Status: local implementation direction accepted from the user's request to execute the plan; production decisions outstanding. This record is not deployment/spending authority.

## Ownership and boundaries

| System | Authoritative records | Boundary |
| --- | --- | --- |
| Atrium extension | Client/recipient identity, document catalog, ACL, guest grants, account claims | Separate service and PostgreSQL database; no accounts added to the public Forecast app |
| Documenso | Envelope/signature state, sealed PDF and audit evidence | Provider API only; never write its tables from the integration worker |
| Stripe Invoicing | Invoice number, amount, balance, native status and payment evidence | One binding per obligation; disable Atrium Checkout collection for these records |
| Attio | Existing People, Companies, Deals and Client Engagements | Approved ID mappings; no domain-only entitlement or automatic Deal creation/win |
| Integration module | Inbox, outbox, effect receipts, reconciled projections | Atrium database transactions; leases, retries and uncertain-effect recovery |
| Existing PandaDoc | Historical and in-flight transactions | No implicit resend, cancellation, duplicate obligation or bulk migration |
| Public GrowthCast site | Marketing/Forecast and current encrypted private proposals | Independent Vercel deployment; exact proposal cutovers only after acceptance |

Canonical URLs are `https://clients.growthcast.app/[client]/{proposals,contracts,documents,invoices}/[ID]`. Slugs resolve server-side to immutable clients; project/document ACLs apply on every canonical, native, API, download and search path. A slug is not authorization. Guest grants are bound to one recipient/version, not company-wide access. Account claims require verified email and transactional one-use invitation consumption.

All portal/signing pages, errors and artifacts must be private and noindex. Use `X-Robots-Tag: noindex, nofollow` throughout, no sitemap/IndexNow, no session replay or marketing analytics. Private artifacts additionally require no-store. Generic locked pages must not disclose client names or document metadata.

## Revalidated upstream baseline

| Component | Revision | Findings |
| --- | --- | --- |
| Atrium | `1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2` | main still resolves here; Bun 1.3.9; Next/Nest/Prisma; `DocumentResponse` and access tokens require `userId`; native guest continuity needs development |
| Documenso | `389390c884949fe27c240488a3259da3cdba93e0` | release and v2.18.0 resolve here; Node >=24/npm >=11.17; native token PDF route fails GrowthCast's additional authorization requirement |

`ALLOW_SIGNUPS=false` in the inspected Atrium code does allow unexpired pending invitations and denies organization creation. This is implemented at auth database hooks, not just a login screen. Preserve those controls and add verified claim scope; don't introduce a second onboarding implementation that bypasses them. The old security audit is an upstream point-in-time report, not acceptance evidence for this deployment.

Atrium Direct Keys credential saving creates/deletes Stripe webhook endpoints. Do not use it to test connectivity. Its API and unified entrypoints perform schema pushes including `--accept-data-loss`; unified startup prints a credential-bearing database prefix. Neither entrypoint is suitable for the proposed release.

## Feature and license matrix

| Feature | Evidence at pinned source | Release disposition |
| --- | --- | --- |
| Atrium catalog/account UI | Existing models/controllers and portal/dashboard routes | Reuse in a separate GrowthCast checkout with retained notices |
| Atrium guest PIN/client slugs/HTML | Not supplied by current token/user schema and upload types | Add explicit entities, guards and rendering pipeline after gate |
| Atrium hosted agency-client service | `LICENSE`: Elastic License 2.0 with hosted/managed-service limitation | Obtain a recorded determination/permission for the exact service; do not assume source-available means unrestricted hosting |
| Documenso core modifications | AGPL-3.0 section 13 addresses remote source availability | Record corresponding-source delivery and attribution obligations before release |
| Documenso action authentication | `types/document-auth.ts`; `set-document-recipients.ts` checks `cfr21` claim | Do not remove feature checks; confirm entitlement/pricing if selected |
| Embedding/branding | Separate enterprise/license behavior must be verified against deployed license | No promise that the desired branded embed is free or enabled |
| Accountless protected PDF | Token route does not consult configured access auth | Native mode rejected for this requirement; gateway spike required |
| Canonical invoices | Atrium payment service uses Checkout flows | New Stripe Invoicing mode; no second payable route |

This matrix records engineering dependencies, not a legal opinion. Exact primary sources: [Atrium license](https://github.com/Vibra-Labs/Atrium/blob/1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2/LICENSE), [Documenso license](https://github.com/documenso/documenso/blob/389390c884949fe27c240488a3259da3cdba93e0/LICENSE), [release notes](https://github.com/documenso/documenso/releases/tag/v2.18.0).

## Decisions that remain open

1. Hosting provider, region, cost ceiling and staging strategy. Asked during execution; no answer recorded yet. No resources purchased.
2. Supporting `sign.clients.growthcast.app` origin, actual license entitlement and certificate trust level.
3. Identity policy: proposed eight-digit recipient PIN, 30-day grant, one-hour session, independent delivery and any email verification. These remain proposed deployment defaults.
4. Full-execution account invitation trigger and exact project/document/billing membership scope.
5. Billing/tax/discount/prepayment representation, payment methods and live-send policy. Commercial examples are not charge approval.
6. Legal/security/retention owners, recovery targets and approved alert/email recipients.
7. Per-client source version/visual acceptance, new PIN delivery and eventual legacy route cutover.

Read-only authenticated Attio, Stripe and PandaDoc inventories could not be completed with the available connectors. Exact remote IDs, existing native integrations and in-flight obligations are unknown; no empty inventory is implied. Public DNS lookups returned no answers for either proposed hostname during this run; zone ownership/configuration has not been authenticated or changed.
