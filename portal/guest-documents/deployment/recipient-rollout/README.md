# Staging recipient signing release — 2026-09-26

Staging now sends approved documents through the existing Google Workspace SMTP configuration and private Documenso service. Production is unchanged. The staff review has an approval-bound **Require PIN** checkbox (on by default). Turning it off sends one private link email and opens signing without a code; leaving it on sends the separate eight-digit code. Existing approval hashes and required-PIN links retain their original policy. Both modes retain expiry, revocation, organization scope and one-use session handoffs.

The gateway now allows the provider's asset-request burst (512 connections) and keeps backend sockets alive for 65 seconds, longer than the ALB's 60-second idle timeout. The previous 32-connection limit and five-second keepalive caused the observed asset 502s and unhydrated signing UI. Gateway PIN screens use the portal's existing local Manrope/DM Mono fonts, warm background and GrowthCast wordmark. Native Documenso team 3 branding supplies the same identity on signing screens. The exact public team-logo route serves the fixed local logo, with no provider management API exposed. PIN-free opening first shows a neutral loading state, never a code prompt.

The staff delivery status now polls through `sent` until completion, and previously sent approvals lock their fields/policy. The database remains at migration 13. `pin_sending` is retained as the existing durable PIN-policy resolution stage; for a link-only approval it performs no SMTP operation. No new infrastructure service or scanner was added.

## Acceptance

- 72 workflow/database/HTTP checks and 34 gateway/policy checks pass.
- The real local provider suite verifies approval-bound optional PIN, exactly one link-only SMTP message, refusal to bypass required PIN, revocation, canonical signing, cryptographic PDF validation and original-project publication.
- Frontend container build and public Docker build pass. Targeted changed-runtime ESLint passes; broader legacy portal lint still reports existing issues outside this change.
- Actual staging UI imported PDF tags, approved and sent both controlled documents only to `ewhite@growthcast.app`. Google Workspace accepted two messages for the original required-PIN test and one for the optional-PIN test; SMTP acceptance does not claim inbox receipt.
- The operator completed the original document. The controlled optional-PIN browser opened without entering a code, filled the required Company field and signed “NONBINDING TEST ONLY.” Both canonical completions published verified signed PDFs to the original project.
- Both exact sealed-PDF hashes were verified through the HTTPS recipient gateway, with anonymous downloads denied. Desktop/mobile branding and zero failed CSS/JS/font/image assets are checked independently.
- Independent encrypted backup/restore passes after these records were created. Daily recovery remains enabled at 06:00 UTC. Temporary reviewer sessions, credentials and admin membership are removed; the clearly labeled nonbinding project/documents remain for operator review.

Receipts are in `release/staging`. Private links, PINs, login passwords and screenshots remain outside the repository. Current frontend is `dpl_2XVSr5Kp42PfwbdQsz4SrDZQ5GrS`; ECS API revision 18 enables sending. Gateway revisions and exact image digests are recorded in release receipts. Signing secret values were neither changed nor reissued.

The current bounded recipient grant lasts at most one hour; approval validity is seven days. Longer-lived access/reissue and broader production acceptance remain follow-up integration work. This release does not promote Phase 3 to production.

## Operations

`delivery-release.py` records the original delivery baseline and commissions the existing guest container's SMTP worker. `delivery-gateway.py` builds the recipient image and updates only the existing gateway/API containers or fixed logo route. `recipient-web.py` prepares and aliases the staging frontend. `signing-service/brand.py` updates only the dedicated staging provider team's native branding settings. `recipient-closeout.py` removes the temporary review login and verifies the existing recovery workflow. Do not rerun controlled sends: their immutable histories are retained; creating another test requires a separately identified fixture.
