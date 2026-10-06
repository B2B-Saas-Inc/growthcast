# Production document workflow release — 2026-09-26

The operator explicitly authorized promoting the completed staging changes to production. This release preserves production's existing users, password hashes, projects, budgets, files, encrypted settings, Workspace SMTP configuration and independent infrastructure. It does not import staging fixtures or point production at staging.

Acceptance: production deployment `dpl_H1wwWTwMbnHfS982z4mufpY7Pj8i` is READY and aliased. All four services are healthy with exact expected digests. Sixteen production package checks, ten live browser checks, public-route denials, unchanged account digests, independent schema13 restore and ten-version secret recovery pass. Temporary reviewer credentials are removed; the post-cutover Vercel error scan returned zero records. No live test emails were sent; real signing/completion/email transport was exercised in the accepted staging/local release.

## Included behavior

Documents is a sidebar item after Reports and before Library. Overview shows the six section previews. Staff have three-dot catalog/client/recipient actions, immutable PDF upload and preview, supported Documenso `{{ }}` tags and a field editor. Approval records the exact recipient, version, fields and PIN policy; Send is explicit. The single-recipient signing flow publishes the verified executed PDF to its original project and sends the executed copy through the existing Workspace settings. GrowthCast branding covers PIN, signing, completion and favicon; Share is hidden. Both native download buttons resolve to the exact authorized PDF versions. New links follow approval expiry up to seven days; browser sessions remain one hour.

## Independent production deployment

The four additive migrations010–013 retain their original checksums. API, guest runtime and backup/restore images use the same thirteen-migration manifest. The API task gains the staff/delivery container; the private Documenso provider, gateway and lifecycle services use the existing production VPC, cluster, load balancer and Supabase database. Staging remains unchanged.

Provider encryption, API credentials, database passwords and the document-signing certificate are generated independently for production and pinned in Secrets Manager. The signing certificate is a self-signed GrowthCast identity, separate from HTTPS; this is not a claim of public PDF trust-list certification. Ten production secret versions have independent encrypted escrow and exact-version recovery under the existing separate recovery identity. No new scanner or third-party mail service is added.

The frontend is built for the production Vercel project/environment with its live alias held until backend acceptance. Exact source overlays, migration checksums, change sets, image digests, verification and alias receipts are in `release/production`. Values, passwords and browser fixtures are not committed.

## Pre-release recovery repair

The initial check found a retained failed recovery lock. Capture correctly rejected two references to already-deleted files in an old isolated `Library release review` project whose synthetic organization had been removed. The cleanup checks the exact project, organization, two file IDs and test title before deleting that orphaned test project. It does not delete customer records or weaken capture validation. The lock is released only after its owner is confirmed failed, no workflow is running and no backup/restore tasks are running, with an exact-owner conditional delete. The subsequent production backup and independent restore pass.

## Release and rollback

Helpers are explicit operations, not a general unattended deployment pipeline. `release.py` records the baseline. `provider.py` and `signing.py` provision production-only dependencies. `images.py` derives reviewed overlays from accepted application digests. `backend.py` pauses the recovery schedule, applies guarded migrations using a temporary migration login, updates the existing API task and provisions signing services. `recovery.py` updates the existing recovery task references and restores the original thirty-minute cadence after independent verification. `web.py` switches the alias only after backend acceptance. `browser.py` checks native owner/client sessions and responsive screens in an isolated fixture, then removes that fixture. `accept.py` checks task health, exact digests, routing denials, recovery, account preservation and the final alias.

On failure, retain receipts and reconcile actual cloud state. Do not overwrite production with a staging snapshot or roll schema backwards over signed records. The previous API image is not schema13-compatible at startup: use the recorded schema13 API with guest sending disabled for a backend rollback, and the recorded previous frontend alias if needed. Preserve current production secrets, signed files and completion records. Resume the prior recovery cadence only with matching migration manifests and verified recovery.
