# GrowthCast guest document workflow

**Production documents live — 2026-09-26:** the completed staging document workflow is now deployed to `https://clients.growthcast.app`: Documents navigation, field/tag preparation, optional-PIN signing, GrowthCast branding/favicon, verified downloads, executed-PDF emails and seven-day link validity. Production keeps its own data, credentials and services; existing accounts/password hashes are unchanged. Ten production browser checks, runtime/access checks and independent data/secret recovery pass. Thirty-minute recovery is restored. See `portal/guest-documents/deployment/production/README.md`.

**Staging signing-link expiry — 2026-09-26:** new signing links follow the approved expiry, up to seven days, while browser sessions remain one hour. Existing links are unchanged. Both PIN modes, expiry/revocation and the full local signing/PDF/email flow pass. See `portal/guest-documents/deployment/expiry-rollout/README.md`. Production unchanged.

**Staging download and favicon fix — 2026-09-26:** native Original/Signed download buttons now resolve through the exact approved/verified PDF versions; browser checks click both buttons and compare file hashes. Signing and confirmation icons now use the existing GrowthCast portal favicon. See `portal/guest-documents/deployment/download-rollout/README.md`. Production unchanged.

**Staging completion email — 2026-09-26:** confirmation screens hide Share and retain Download. The existing delivery worker now sends the verified executed PDF through Workspace SMTP once per completed document. Missing operator test copies were accepted by SMTP. See `portal/guest-documents/deployment/confirmation-rollout/README.md`. Production unchanged.

**Staging recipient signing live — 2026-09-26:** asset-loading failures are fixed; PIN and signing screens use GrowthCast branding. Staff approvals now offer optional PIN, with one email for link-only access or a separate code email when enabled. Both live signing modes, verified project PDFs and protected downloads pass; independent recovery passes and production is unchanged. See `portal/guest-documents/deployment/recipient-rollout/README.md`.

## Current scope

The user explicitly rejected the added malware scanner on 2026-09-26. That instruction supersedes the earlier scanner plans and prerequisites. There is no antivirus service, signature feed, scanner host, remote scan endpoint or scanner credential requirement in this candidate. Do not reintroduce them. Continue the requested Documenso integration using the existing portal infrastructure.

## Staff document review

- Staff-only client/recipient setup and project-linked document drafts, entered from the Documents sidebar item. Overview keeps the four summary cards and shows preview tiles for Projects, Calendar, People, Reports, Documents and Library. Settings has no preview tile.
- Immutable PDF uploads to the existing private storage adapter. The server checks authenticated staff/project scope, MIME type, PDF header, title and the 3 MiB limit. Stored bytes are read back and hashed before a version is registered. This does not claim malware scanning or full PDF parsing.
- Protected stored-version PDF previews with current authorization checked before and after storage reads.
- Recipient-specific approval with the exact version/hash and branded document/code email templates recorded immutably. Approval previews use explicit link/code placeholders; sending hydrates only the approved template.
- A bounded PIN/guest access foundation and private staff ingress. The limited staging gate keeps guest, PIN and dispatch routes disabled until their integration is ready.
- A Node runtime image that checks private configuration, verified database TLS, restricted role and schema/migration history before listening.

The existing Documenso signing/gateway implementation remains under `portal/gateway`, `portal/atrium-spike`, and the deployment runtime. This candidate is not a replacement signature engine. Wire approved document versions into that existing provider integration rather than adding another upload service.

## Status and release work

The signing candidate now passes the full local single-recipient flow: field placement, approval, durable send, branded SMTP capture, protected PIN access, actual client input/signature, verified final PDF and original-project attachment. Live staging delivery and both recipient signing modes now pass controlled acceptance. Migration013 and separate gateway/lifecycle services are now deployed in staging. See [signing implementation](signing/README.md) for verification and exact deployment boundaries.

Document catalog, Clients and Recipients now have three-dot create/view/edit/delete menus. PDF uploads import supported Documenso `{{type, r1, ...}}` placeholders into editable approval-bound fields. See [catalog and placeholder behavior](catalog/README.md), including the single-recipient limitation. Tagged-PDF provider handoff and the real local signing/completion flow are now verified.

The catalog release targets staging only with additive migrations011/012. Migration012 preserves the label rule in a dump/restore-stable form; the original migration010 and applied011 are unchanged. Release acceptance and recovery receipts are under `deployment/catalog-rollout/release/staging`. Production remains separate; the later recipient release enables staging sending.

The persistent private Documenso service and the separate restricted gateway/lifecycle services are healthy in staging. Private provider API authorization and seven HTTPS route/access checks pass. Migration013 is applied; the matching backup/independent restore and integration-secret recovery pass. Ten admin/client browser checks pass and the existing daily recovery schedule is restored. The subsequent recipient release commissions delivery and passes live signing/PDF attachment acceptance. See [commissioning and receipts](deployment/signing-rollout/README.md). Production remains unchanged.

## Verification

Run in containers; install no host dependencies:

```sh
sh portal/guest-documents/run.sh
sh portal/guest-documents/integration-run.sh
docker build -f portal/guest-documents/runtime/Dockerfile -t growthcast-guest-runtime portal
sh portal/guest-documents/runtime/run.sh
sh portal/guest-documents/web/build.sh
sh portal/guest-documents/web/run.sh
```

The browser fixture uses actual Better Auth, HTTPS and PostgreSQL with in-memory private storage and generated PDF fixtures. It is not a deployment adapter. Current evidence is in `evidence.json`, `web/browser-evidence.json`, and `runtime/catalog-acceptance.json`. Previous scanner evidence has been removed with that implementation.

Private draft: https://github.com/B2B-Saas-Inc/growthcast-client-portal/pull/1
