# Staging signing-link expiry correction — 2026-09-26

The delivery adapter previously capped emailed links at one hour although staff approval lasts seven days. New document grants now follow the remaining approved lifetime, capped at seven days. The general account gateway retains its default one-hour grant limit; only the document-delivery issuer opts into the longer limit. Browser sessions still expire after one hour, and one-use handoffs after 60 seconds. Clients can reopen the original email link and follow its approved PIN policy to get another session while the approval remains valid.

Existing grants, including expired links, are unchanged. No automatic resend, new email, or extension of an old approval occurs. Approval expiry and dispatch revocation remain enforced by the existing database eligibility function on every private request.

## Verification and rollout

The real local Documenso/SMTP/browser flow verifies seven-day grant alignment, signature completion, canonical PDF verification, once-only executed-PDF email, and actual Original/Signed download buttons. The 37 gateway/policy checks include both PIN modes reopening after session expiry, grant expiry, immediate revocation and refusal of excessive lifetimes. The default gateway still rejects grants beyond one hour. Changed-source lint and the public Docker build pass.

Only the guest delivery container in the existing staging API task is updated. The recipient gateway, lifecycle service, frontend, SMTP configuration, database/schema13, daily recovery and production remain unchanged. Release receipts live in `release/staging`. Verification does not send live emails or retroactively extend the operator's earlier test links.
