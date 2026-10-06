# Staging document review release

**Staging recipient signing live — 2026-09-26:** asset-loading failures are fixed; PIN and signing screens use GrowthCast branding. Staff approvals now offer optional PIN, with one email for link-only access or a separate code email when enabled. Both live signing modes, verified project PDFs and protected downloads pass; independent recovery passes and production is unchanged. See `portal/guest-documents/deployment/recipient-rollout/README.md`.

**Staging signing infrastructure — 2026-09-26:** migration013 and separate gateway/lifecycle services are deployed. Integration-secret recovery, private provider API authorization, seven HTTPS checks, ten staff/client browser checks, and independent data restore pass; daily recovery is restored. Sending remains disabled pending controlled live delivery/signing acceptance. Production unchanged. See `signing-rollout/README.md`.

This release adds the staff document runtime to the existing staging ECS task and ALB. It reuses the API's restricted database, private Storage and origin-proof delivery. Task CPU/memory, database, credentials and mail transport remain the existing ones. No scanner is included.

`prepare.py` records the live baseline, starts a backup/restore, builds digest-pinned API/guest/backup/restore images and submits the frontend preview. Image preparation checks every migration file's readability and checksum as the default container user. Release records live in `release/staging`; do not copy private task histories or diagnostic files into publication bundles.

`rollout.py` checks local Docker before draining staging, applies migration010 using the short-lived migration login, disables that login, updates the existing task and recovery workflow, and switches the staging alias. Run its commands in order: `pause`, `migrate`, `api`, `recovery`, `alias`, after `prepare.py poll` reports a verified baseline and `prepare.py web` reports READY. Only staging is accepted by these entrypoints.

`live-review.py seed`, `review`, `cleanup` exercise native admin/client sessions, staff catalog scope, client denials, Overview navigation and mobile rendering. They use an isolated synthetic workspace. Upload/approval writes remain covered by the local HTTPS browser suite; this live check does not claim to verify document sending.

`finish.py recovery` starts/polls the new ten-migration recovery workflow. After it verifies and browser fixtures are removed, `finish.py finish` verifies both targets and restores the original recovery schedule.

The first baseline identified leftover synthetic Library projects whose storage objects had already been removed. The exact test projects were removed, the Library cleanup now deletes its project explicitly, and the second baseline verified. The first image attempt exposed unreadable copied manifests; publication now explicitly sets readable permissions and checks all migration files. The guest listener uses priority2 and the API catch-all priority10, allowing rollback to the original API priority1 without a listener priority collision.

## Catalog and tag update

`catalog-release.py` coordinates the subsequent staging-only catalog/tag release. Its receipt root is `catalog-rollout/release/staging`. The release adds011 catalog state/audit and012 equivalent restore-stable label constraint, while retaining migration010 and011 checksums. Runtime and recovery packages all use the same twelve-migration manifest. The first schema11 archive was restored locally for diagnosis: the only difference was PostgreSQL's reparenthesizing of a BETWEEN CHECK expression. Migration012 resolves it without changing validation or data. The failed execution's lock was reconciled only after all recovery tasks stopped and with an exact-owner condition.

Catalog acceptance requires local CRUD/tag checks, ready frontend, healthy API/guest targets, ten live checks with fixture cleanup, VERIFIED independent recovery and restored daily schedule. Sending stays disabled. This release does not claim tagged-PDF provider sending/signature acceptance. The candidate delivery migration is now013.

## Persistent signing provider

The private staging Documenso service is deployed separately in the existing VPC and cluster. Database and signing-certificate health checks pass, and service discovery matches the healthy task. Its ingress accepts only the portal API security group. The portal API task and delivery capability remain unchanged. See [provider deployment and receipts](signing-service/README.md). Gateway/worker wiring, API authorization, migration013 and full live acceptance remain before enabling sending.
