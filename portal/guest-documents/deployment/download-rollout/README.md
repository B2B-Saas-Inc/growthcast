# Recipient Original / Signed download repair — 2026-09-26

The native confirmation dialog uses `/api/files/token/<recipient>/envelopeItem/<item>/download/original` and `/download/signed`. The gateway previously allowed only the PDF viewer's versioned file URL, so both dialog actions returned access errors. Earlier acceptance downloaded the viewer URL directly and missed these UI-specific paths.

The policy now accepts only exact bound recipient/item paths for GET/HEAD, without query overrides. The proxy resolves each accepted download to the grant's exact documentDataId: original maps to initial, signed maps to current. It never follows the provider's mutable item pointer. Canonical completion is still the only source of replacement sealed data IDs; session, organization, expiry and revocation checks remain in place. No additional provider API family or anonymous download access is enabled.

The local gateway suite has36 passing checks, including native paths, wrong recipient/item, query/verb overrides, revocation, same-origin favicon CSP, and exact versioned upstream resolution. The real provider browser suite now clicks Download → Original and Download → Signed and compares the downloaded bytes with the original and verified sealed PDF hashes. The same button-click checks run against staging. Source and tests are in `gateway/src/{policy,server}.mjs`, `gateway/test/gateway.check.mjs` and `guest-documents/{signing,deployment}/delivery-browser.mjs`.

Only the existing staging gateway image is updated. API revision19, completion emails, database migration13 and the independently verified recovery configuration are unchanged. Production is unchanged. Exact gateway image and live browser receipts are in `release/staging`.

Signing/PIN/confirmation favicons and touch icons now serve the exact existing `growthcast-favicon-v2.jpg` portal asset, including the provider’s fixed icon URLs and fallback favicon.ico. They are returned with the correct JPEG Content-Type; the manifest identifies GrowthCast. No image alteration or external icon host is involved. Live checks compare every icon response hash with the portal asset.
