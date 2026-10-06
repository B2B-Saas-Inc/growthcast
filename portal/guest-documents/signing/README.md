# Recipient fields, delivery and Documenso signing

The single-recipient workflow passes end to end in disposable containers with the pinned Documenso server: approve a PDF and field layout, explicitly queue Send, receive separately captured branded link/PIN messages, enter required text and sign, verify the sealed PDF, publish it once to the original project, and download it through the protected guest session. SMTP acceptance is shown as acceptance, not proof of inbox delivery. Approval alone sends nothing.

The field editor supports signature, initials, name, email, date, text, number and checkbox fields. Labels, required values, page and percentage coordinates are part of the immutable approval. Reopening restores the approved layout. Changed fields require a new approval. The server parses actual PDF pages in a bounded worker before creating a provider document.

`delivery.mjs` implements a durable leased queue. Concurrent requests deduplicate by version/recipient. Tagged PDFs have a separate durable field-configuration step after draft creation and before activation. It persists each external-effect boundary before provider creation, activation, PIN provisioning and the two emails. An ambiguous outcome is held for review and is never automatically replayed. Provider tokens and delivery access are encrypted with send-bound authenticated encryption. Current staff, approval, project and dispatch scope are rechecked before effects; dispatch revocation also denies existing guest sessions.

`workspace-mail.mjs` uses the existing encrypted Atrium workspace settings and Google Workspace configuration for clients@growthcast.app. It does not require another email provider or another SMTP password. The adapter is locally tested and enabled in the existing staging delivery container behind an explicit delivery mode.

`completion.mjs` rereads the canonical provider envelope and exact recipient/item binding, verifies the final PDF against a configured trust bundle, stores the final artifact, and invokes a restricted lifecycle-only database function. That function attaches a signed native document/file to the original project, records immutable provider ownership and updates the grant's sealed artifact. The HTTP application role cannot forge completion or overwrite provider-owned documents.

## Deployment boundary

The single-recipient integration is deployed to staging with additive migration013, a private Documenso service, separate restricted gateway/lifecycle services and the existing delivery worker using Workspace SMTP. Both required-PIN and link-only flows, canonical completion, original-project publication and executed-PDF emails have passed staging acceptance. The same single-recipient workflow is now deployed independently to production; see [production acceptance](../deployment/production/README.md). See [recipient release](../deployment/recipient-rollout/README.md), [completion emails](../deployment/confirmation-rollout/README.md) and [download/favicon repair](../deployment/download-rollout/README.md).

New signing links follow approval expiry, up to seven days; browser sessions remain limited to one hour and handoffs to 60 seconds. Reopening a still-valid email link creates a fresh session under the same approved PIN policy. Existing grants are not extended or reactivated. Approval expiry, dispatch revocation and current scope are still checked on every private request. See [expiry release](../deployment/expiry-rollout/README.md).

Countersigning and account claims remain outside this single-recipient release. No scanner or additional service is required.

## Verification

```sh
sh portal/guest-documents/signing/run.sh
sh portal/guest-documents/signing/delivery-run.sh
sh portal/guest-documents/web/run.sh
```

The delivery harness uses real local SMTP, the real pinned provider, the existing PIN/session gateway and a real browser. It checks required text input, signature completion, CMS signature verification and tampering, native project projection, authenticated final download and anonymous denial. Evidence contains no customer addresses, tokens, PINs or signing links. Three Workspace SMTP adapter tests verify encrypted settings, fixed sender/host, current configuration changes, uncertainty and credential suppression. The shared gateway regression has 37 passing checks; the staff UI has 19, and the existing workflow has 65.

PDF placeholder import and verified provider reconciliation are documented in [catalog and tags](../catalog/README.md). The current delivery fixture uses a tagged source PDF and passes real client input, signature, canonical completion, cryptographic signature verification, original-project attachment and authenticated signed-PDF download. Provider preparation also preserves the untagged exact-byte path.

`source-pdf-core.mjs` mirrors the pinned provider's placeholder whiteout and binds every parsed PDF object plus root/info/encryption references. Random file IDs and physical cross-reference serialization do not affect this comparison. Changed text, drawing content or approved field layouts fail verification. The expected proof is recomputed from the immutable original; no caller-provided replacement PDF is trusted. Unsupported tags are rejected before provider creation.

`storeWithPool` keeps the original disposable store entrypoint restricted to test databases while allowing the verified managed adapter to supply a pool. It checks the configured environment when issuing, redeeming and authorizing grants. The SQL eligibility function exposes only a boolean to gc_gateway, and its PIN-exchange permissions do not permit grant issuance/rotation or canonical completion writes.

The candidate managed delivery factory fixes the private provider authority, rejects redirects and caller credentials, scopes sends to one workspace, and constructs the real PDF/provider/gateway/Workspace adapters. The runtime can start its non-overlapping worker only with explicit private configuration and migration013. Staging sending is enabled; production remains unchanged.

The lifecycle queue and packaged gateway/completion entrypoints now exist. Candidate migration013 exposes only pending encrypted bindings through `guest_pending_completions` to gc_lifecycle, with keyset pagination so unsigned or failing records cannot block later pages. It does not grant access to PIN ciphertext or the send table. The real tagged-PDF signing fixture now invokes that queue under gc_lifecycle and passes final signature verification, once-only original-project projection and protected download. Runtime packaging includes OpenSSL and543 exact pinned-provider asset paths. These entrypoints and migration013 are deployed in staging. See `lifecycle-runtime-evidence.json` and `../runtime/README.md`.

Staging delivery/gateway/lifecycle secrets and separate consumer permissions are now provisioned and verified by actual ECS tasks (three own reads, nine cross-secret denials). The dedicated runtime identities and secret wrapper are now deployed to staging. See `../deployment/signing-secrets/README.md`.
