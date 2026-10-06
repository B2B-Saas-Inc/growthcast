# Protected staging Atrium frontend

The pinned Atrium interface is now deployed at **https://clients.staging.growthcast.app**, behind the existing all-deployment Vercel Authentication. It replaces the prior proxy verification page. This is the upstream interface integrated with the staging boundary; GrowthCast branding is applied as documented below; integrations and later plan phases are not claimed complete.

`prepare.py` archives only tracked source at `1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2` from the clean upstream checkout into a fresh temporary context. It removes environment files, preserves the upstream Bun lockfile, adds the tested Node API route and makes these targeted changes:

- Browser requests use the same-origin `/api` proxy, including two upstream localhost fallbacks.
- Five server-rendered account/branding/layout modules use `server-api.ts`, a server-only wrapper around the same proxy factory. It admits only the canonical web origin and `/api/` routes, forwards account cookies through the existing allowlist and uses no-store requests. It does not make authenticated requests back through Vercel's frontend protection.
- Root rendering is dynamic; private response/noindex headers prevent shared account-page caching. API proof access remains in server request execution, never client code.
- Middleware requires the canonical staging origin and strips incoming custom-host headers. Custom tenant domains are not enabled by this deployment.

Local container production build and strict TypeScript checking passed; the Vercel build is READY. The existing project root is now `apps/web`. `deploy.py` explicitly selects preview; `alias.py` only assigns a ready preview belonging to the protected project. The previous proxy-only deployment remains available by ID for rollback, but its canonical alias is superseded. `deployment.json` and `source-evidence.json` identify the deployed source; `audit-evidence.json` verifies protection, the canonical alias and exactly three preview variables (sensitive proof plus two public origins). No application auth/database/Storage credentials were transferred to Vercel.

## Browser acceptance

A containerized `agent-browser@0.38.1` used a short-lived, same-project Vercel OIDC token scoped to the staging origin. Protection was never disabled, and the token was not logged or persisted. The actual UI passed:

- Existing synthetic account login and assigned-project navigation.
- Full authenticated page reload, exercising server-rendered account/organization requests.
- Secure, HttpOnly, SameSite=Lax, host-only session cookie checks.
- File upload through the UI and byte-identical browser download.
- Other-organization project and active-organization change denial.
- GET, HEAD and Range denial after removing the project's client assignment.
- UI logout, null session afterward, and rejection of the prior session cookie on replay.
- Desktop visual inspection and 390px mobile login without horizontal overflow.

See `browser-evidence.json`, `mobile-evidence.json`, `login.png`, `login-mobile.png` and `project.png`. The fixture was a deliberately pre-verified synthetic user: this run does **not** test invitation delivery or email verification. It also does not test persistence of an authenticated account/file across ECS task replacement. Earlier cloud HTTP email-verification and empty-service replacement receipts retain their separate scope.

Fixture writes used only the existing restricted gc_app connection and scoped Storage identity. A separate readonly backup connection hashed all 52 Atrium tables before/after; cleanup found exact equality and an empty fixture Storage prefix. All local fixture credentials and the browser container/session were removed. `cleanup-evidence.json` records the independent data check. Two earlier driver attempts were cleaned and audited: an empty set-active payload was incorrectly expected to fail, then unsupported selectors were replaced with fresh snapshot refs. The final complete run passes; prior cleanup receipts are retained.

The React review preserved existing parallel server reads, kept proof logic out of client components, and introduced no hooks or client state changes. Remaining Phase 2 acceptance includes browser invitation/verification and task-replacement persistence, managed signing, live-secret recovery/rotation, and capacity/recovery objectives. Operational frontend monitoring and complete product-specific UI/integrations remain open.


## GrowthCast branding and retained review accounts — 2026-09-25

The protected staging preview now uses the live GrowthCast site's Manrope/DM Mono fonts, warm paper background, charcoal buttons, coral accents, fine borders and spacious login layout. The attached GrowthCast wordmark is preserved byte-for-byte and displayed in login, admin and client headers; the website symbol supplies the favicon. `brand/DESIGN.md` records the observed source and adaptation. `brand/apply.py` reproducibly applies these changes to the pinned upstream archive. No new React hooks, client fetches or secret-bearing props were introduced. Local production build/type checking and the Vercel production build passed.

The requested admin (`ewhite@growthcast.app`, organization owner) and test client (`ewhite+client@growthcast.app`, member) are retained for review. The client has one assigned sample project, “Your growth roadmap”; “Internal planning” is admin-only. Separate generated passwords are stored outside the repository in `~/.config/growthcast/portal-staging/review-logins.md` (0600), not in evidence files. No invitation or verification email was sent. These deliberately pre-verified accounts do not close email-verification acceptance.

`../review-accounts/verification.json` records successful browser login for both roles, admin visibility of both sample projects, client denial (404) of the unassigned project, loaded logo/Manrope fonts and mobile layouts without horizontal overflow. `brand-login.png`, `brand-admin.png`, `brand-client.png`, `brand-project.png`, `brand-login-mobile.png` and `brand-client-mobile.png` capture the deployed UI. Browser sessions are signed out afterward; accounts and sample content remain. `pre-brand-deployment.json` preserves the previous deployment reference.


Homepage branding correction (2026-09-25): the root `/` route previously retained the upstream Atrium heading even though account pages were branded. The archive overlay now replaces that heading/icon with the shared GrowthCast wordmark and portal-specific introductory copy, preserving Sign In and Get Started navigation. `home-brand-evidence.json` and `brand-home*.png` record the live root-route verification.


Client profile fix (2026-09-25): saving a company name previously sent GET-only user/organization IDs back to the strict PUT DTO, causing HTTP 400. The frontend overlay now sends only the five editable profile fields. Deployed browser create/edit/reload checks pass, identity override validation remains enforced, and independent 52-table cleanup hashes match. See `portal/deployment/profile-save/evidence.json`; the retained review account profile was not altered.


Verified-access update (2026-09-25): deployed API and frontend now require email verification before portal access. Unverified signups receive no session; sign-in and invitation acceptance require verification; old unverified sessions are denied by the shared API guard and redirected by page layouts. Captured-email verification now shows a session-checked confirmation and completes the client invitation. Six focused guard tests, live denial/verification/client-login flows and final service audit pass. See `portal/deployment/verified-access/README.md`. Concurrent review-account/session/project changes were preserved during scoped fixture cleanup.
