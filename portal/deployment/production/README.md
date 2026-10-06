# Phase 2 production release

**Production documents live — 2026-09-26:** the completed staging document workflow is now deployed to `https://clients.growthcast.app`: Documents navigation, field/tag preparation, optional-PIN signing, GrowthCast branding/favicon, verified downloads, executed-PDF emails and seven-day link validity. Production keeps its own data, credentials and services; existing accounts/password hashes are unchanged. Ten production browser checks, runtime/access checks and independent data/secret recovery pass. Thirty-minute recovery is restored. See `portal/guest-documents/deployment/production/README.md`.

**Library update — 2026-09-25:** upload-only contracts, reusable admin Library, sandboxed HTML previews, requested sidebar order and readable API outage errors are live in both separate environments. Migration 009, six live browser checks per environment, independent object restores, cleanup and restored schedules are recorded in [the Library release](../file-library/README.md). Phase 3 guest documents remain a separate undeployed candidate.

The operator requested a production release and migration on 2026-09-25, explicitly selecting separate production and staging. This supersedes older notes that held all production work until Phase 7. Only completed Phase 2 portal features are released; Phase 3 document work has not started.

Production: **https://clients.growthcast.app**. Staging: **https://clients.staging.growthcast.app**. Use the existing admin (`ewhite@growthcast.app`) and test-client credentials; passwords are unchanged. Production sessions are new. Future changes in either environment do not synchronize automatically. Make real client and project changes in production from now on.

## Migrated setup

The consistent snapshot restored 110 private tables and 278 rows. After removing acceptance fixtures, a second read-only comparison matched all 107 untransformed tables against current staging, including account password hashes: two users, one client profile, six projects, six budgets and six staffing assignments. Encrypted settings preserve their plaintext under an independent production encryption key. Production has its own Stripe webhook and signature secret. Origin-bound sessions were discarded; no push subscriptions existed. No invoices or private files existed in the source snapshot. Private upload/download, access isolation and persistence across a backend replacement were tested with synthetic files, then cleaned up.

All Phase 2 UI changes are included: GrowthCast branding, retainer/hourly/flat-fee budgets, internal staff costs and allocation, monthly revenue and margin reporting using invoice-attached hourly entries, project status/settings actions, and single-deployment settings visibility. Real deployed admin/client and desktop/mobile checks passed.

## Independent infrastructure

| Component | Production |
|---|---|
| Supabase | `growthcast-clients-production`, `mdjldxussxdtcjxsoesr`, B2B SaaS Inc., US East, Micro |
| Vercel | `growthcast-clients`, `prj_8w5ML4Kd8WiwprtuYgmCk0jYFYBx` |
| API | `growthcast-portal-production-api`, AWS account `059393269249`, `us-east-1` |
| Secrets | Version-pinned production runtime, database/Storage connection and read-only backup secrets |
| Storage | Own private Supabase bucket and separate writer/reader identities |
| Recovery | `growthcast-portal-production-recovery-059393269249`, versioned encrypted S3 archive |

Production uses independent databases, application keys, database passwords, Storage identities, AWS roles/keys/secrets, network, container images, archive and backup workflow. Vercel receives only the API URL, public portal URL and sensitive origin proof. The private database schemas are not exposed through the Data API; SSL is enforced. Only `gc_app` and the read-only `gc_backup` log in. Documenso and migration identities remain disabled.

The canonical production hostname is public at the Vercel layer but application data requires portal authentication. Generated deployment URLs and previews retain Vercel protection. Staging retains its existing deployment and protection. Both environments use the operator's existing confirmed notification topic; that shared email destination does not grant access between environments.

## Integrations and verification

SMTP TLS authentication with the migrated Google Workspace settings passed without sending email. Production Stripe settings were validated against the existing account without creating a payment. A dedicated endpoint was registered at the production portal URL. The web proxy preserves the exact webhook body/signature and supports server-to-server callbacks; the Bun API uses asynchronous Stripe signature verification. Valid and tampered signatures were tested both against the compiled controller and the actual deployment. Staging's webhook was unchanged.

Key receipts: `migration-evidence.json`, `browser-evidence.json`, `file-evidence.json`, `stripe-verification.json`, `smtp-evidence.json`, `audit-evidence.json`, `release.json`, and `acceptance.json`. The private source repository is https://github.com/B2B-Saas-Inc/growthcast-client-portal. Upstream checkouts remain pinned and unmodified; changes are checksum-guarded overlays.

## Recovery and operations

The production EventBridge rule runs an encrypted backup plus independent restore verification every 30 minutes. Success is recorded only after isolated database/object restoration passes. Workflow failure, timeout, abort, schedule failure and missing successful verification alert the existing confirmed operator destination (`ewhite@growthcast.app`). Archives retain 30 days. The missing-verification alarm uses two 30-minute periods. A failed execution deliberately retains its workflow lock; investigate and verify the tasks are stopped before clearing that specific lock. Never remove a live workflow's lock.

Three real production recovery executions were verified, including a synthetic private object and a final clean migrated baseline. This demonstrates current-volume restore behavior, not a guarantee for future volume. Runtime, connection and backup secrets also passed exact-version recovery through a separate escrow reader, with tampering, wrong-key and data-role access denied. Escrow locators and image/secret pins are versioned here; secret values are not.

For API updates, build the reviewed image, change only the image in `api-foundation.json`, inspect the change set and run `update-stack.py api`. It permits only Task/Service changes. For schedule changes use `update-stack.py recovery`. Review and update the source generator as appropriate before regeneration; creation scripts and the one-time identity/migration scripts are not a general redeploy command.

For rollback, first protect the production Vercel project (`ssoProtection.deploymentType = all`) if needed to stop new portal traffic. Roll back frontend and API to compatible recorded production deployments/images with the same production secrets and schema. The earlier production API image in `pre-webhook-fix-images.json` lacks the asynchronous Stripe fix; prefer fixing forward if payment callbacks are needed. Do not point production at staging or rerun the staging snapshot restore over a populated production database. After production receives new records, a database recovery must use a selected production archive and a fresh isolated target, then verify roles, encrypted settings, files and login before switching connections. See the existing replacement-recovery and secret-recovery runbooks for the tested mechanics, substituting explicit production locators and identities. Escrow recovery is an administrative operation; backup and restore data roles cannot recover application secrets.

Document adapters, production signing-provider deployment and certificate trust acceptance remain in their later phases and are not claimed by this release.

Final source validation: [CI 36188777910 passed](https://github.com/B2B-Saas-Inc/growthcast-client-portal/actions/runs/36188777910) for application code commit `83f0215a32e68843bd25be184300660418cd9d91`; the final evidence commit records the subsequently executed release/audit helpers and receipts. The local deployment suite passed all 63 checks and all four CloudFormation templates validated.
