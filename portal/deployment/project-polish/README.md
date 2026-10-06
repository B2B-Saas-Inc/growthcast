# Project settings and branded transactional email

Requested 2026-09-25. Deployed only to the existing protected staging portal.

## Project UI

The project header has one accessible **Project settings** gear disclosure. It contains the complete start/end date editor, existing date countdown, Duplicate, Archive/Unarchive, and owner-only Delete project. Existing handlers, archive/delete confirmations, and backend permissions are preserved. Escape closes the disclosure when focus is inside it. The sidebar default-rate editor and its unused change handler are removed; previously saved invoice/time rates are not erased. The Budget & team tab remains the visible planning-rate editor.

“Not Started” is the stored project status: `Project.status` defaults to `not_started` in the pinned Prisma schema; the project list replaces underscores with spaces. It does not derive from start/end dates, allocations, retainer settings, or logged time. This change does not automatically advance any existing project status.

`prepare.py` runs after the resource-planning overlay and before shared branding. The pinned upstream checkout remains unchanged.

## Email branding

All fourteen React Email transactional templates and the separately generated SMTP/Resend configuration-test email use the same shared brand components:

- Manrope typography with Arial/Helvetica fallback; DM Mono footer with monospace fallback.
- Warm `#f4f1e9` background, `#242426` charcoal text/buttons, coral `#ff6b4a` accent, thin warm-gray borders, two-pixel corner radii.
- GrowthCast text wordmark and client-portal footer. Identity stays visible without remote image loading.
- Fonts reference the existing public GrowthCast font assets, never the SSO-protected staging host. Custom font support depends on the receiving email client; fallback fonts are intentional.
- Invitation, reset, verification, magic link, welcome, project update, task, invoice, decision and document event links/content are preserved. Dynamic content remains React-escaped.

Templates are applied during API image build by `runtime/atrium-patches/email-brand.mjs`; shared components are in `email-brand.tsx`. The mail transport, alias, authentication, timeouts and captured synthetic-recipient behavior are unchanged. These templates cover the portal's currently deployed notifications; a future separately deployed document-provider service must have its own mail branding reviewed when that phase begins.

Fifteen render tests verify palette/font/brand presence, absence of the old teal/Atrium branding, action-link integrity and escaped dynamic content. Together with prior boundary/resource-planning tests, 35 focused API tests pass. Four safe HTML previews are rendered directly from the production image. No real email is sent for this verification.

## Evidence

- `deployment.json`: API image and reviewed task/service-only update.
- `../web-app/deployment.json`: canonical protected staging frontend.
- `acceptance.json`: live browser settings/date/action/owner/mobile checks.
- `cleanup-evidence.json`: synthetic-only fixture deletion, including duplicated projects.
- `email-invitation.html`, `email-reset.html`, `email-update.html`, `email-test.html`: safe production-rendered previews, with synthetic links only.
- `email-invitation.png`: rendered email visual inspection.

No database migration or recovery image update is required for these presentation changes. The seven-migration schema and previously verified backup workflow remain unchanged.
