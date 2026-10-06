# Private Supabase artifact storage

The dedicated staging project `saedetvoolpdysiyjwvg` now contains private bucket `gc-atrium-private`, limited to 3 MiB per object. A dedicated Supabase Auth **writer service identity** serves the application; a separate backup identity can only read it. Client accounts continue to use Atrium. All six portal PostgreSQL roles remain NOLOGIN. No application or DNS deployment occurred.

Select `STORAGE_PROVIDER=supabase`, `PORTAL_STORAGE_PROJECT_REF=saedetvoolpdysiyjwvg`, and `PORTAL_STORAGE_BUCKET=gc-atrium-private` in the API's explicit application environment. Mount its scoped JSON credential read-only at `/run/storage/credentials.json`. The protected staging copy is outside the repository at `~/.config/growthcast/portal-staging/storage-credentials.json` (0600). It contains the publishable key, subject UUID, service email and random password. Do not substitute a secret/service-role key or mount project administrator credentials in the API. Managed secret distribution is still outstanding.

The compiled `SupabaseStorage` adapter uses the shared REST client, authenticates the service identity, checks the returned subject, and caches the short-lived access token. Concurrent requests share one login. Expiring tokens trigger a fresh password login, avoiding persistent rotating refresh-token state. Transport uses the exact HTTPS project hostname, rejects redirects, bounds request duration and object size, encodes key segments, and suppresses upstream error bodies. Uploads never upsert. Files stay behind Atrium's authorized download endpoint; the adapter does not issue public or signed object URLs.

`policy.sql` adds three subject/bucket-scoped SELECT/INSERT/DELETE policies, a restrictive two-way isolation policy, and an explicit restrictive no-overwrite policy. The isolation layer is tested against deliberately permissive unrelated policies. Supabase's administrative service role still bypasses RLS, so it is used only during provisioning and never by the runtime adapter. Policy application refuses preexisting names rather than replacing them. `staging-policy.mjs` applies the reviewed SQL transactionally under an advisory lock using a separately mounted administrator connection; it is not a runtime startup job. Do not rerun it against the provisioned bucket.

The live compiled-adapter check passed upload, exact-byte download, deletion, duplicate/PUT overwrite denial, anonymous/public access denial, other-identity denial and cross-bucket write denial. Temporary files, probe bucket and probe user were removed; the retained private bucket is empty. [Evidence](staging-evidence.json) records policy definitions, source hashes and cleanup. The complete packaged account/storage API now also passes live upload/download, container recreation, schema-drift refusal/repair and membership-revocation checks; see [HTTP evidence](../runtime/managed-storage-evidence.json). Exact-object cleanup and an independent empty-bucket inventory pass. The default offline suite continues to use its private volume.

Local verification:

```sh
sh portal/deployment/check.sh
sh portal/deployment/runtime/build-atrium.sh "$PWD/portal/checkouts/atrium"
RUNTIME_TEST_SERVICE=atrium sh portal/deployment/runtime/test/run.sh
```

Live verification requires separately provisioned disposable probe credentials and a probe bucket. `live.check.cjs` runs inside the compiled API image with only scoped service/probe credentials and cleans its unique artifact. Never give that check a project administrator key. Administrator setup/cleanup of its temporary probe resources is a separate operation.

## Recovery and selection rationale

Current inspection found a completed physical database backup and PITR disabled. Supabase [database backups exclude Storage object bytes](https://supabase.com/docs/guides/platform/backups); object retention and an independent encrypted database/object restore drill remain open. This bucket is application storage, not an accepted backup destination.

Supabase [S3 access keys bypass RLS across all buckets](https://supabase.com/docs/guides/storage/s3/authentication). Its documented scoped S3 mode still requires the legacy anon key, so the adapter instead uses REST with a modern publishable key plus the service user's JWT. [Modern API keys use the `apikey` header](https://supabase.com/docs/guides/api/api-keys); user authorization is separate. Existing legacy API keys remain disabled. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) enforces the scoped policies.

Documentation captured on 2026-09-24 is saved in the ignored workspace `.firecrawl/supabase-storage-auth-current.md`, `supabase-backups-current.md`, `supabase-api-keys-current.md`, and `supabase-storage-rls-current.md`.

## Complete API with live staging storage

Explicitly opt in; this writes one synthetic object to the existing bucket:

```sh
RUNTIME_TEST_SERVICE=atrium RUNTIME_MANAGED_STORAGE=1 \
PORTAL_STORAGE_CREDENTIAL_FILE="$HOME/.config/growthcast/portal-staging/storage-credentials.json" \
sh portal/deployment/runtime/test/run.sh
```

Only the API and cleanup container have outbound network access. PostgreSQL and SMTP remain disposable and internal. Preparation copies the scoped credential to a dedicated read-only runtime mount (UID 1000, mode 0400); administrator credentials never enter the API. The driver records a unique filename before upload. Cleanup stops the API, lists the bounded project prefix, verifies the exact returned object key, deletes only that file and verifies absence. Failure retains the fixture volumes for diagnosis. The first run exposed a server-side search mismatch; independent inventory caught the leftover, which was removed before a successful complete rerun. No bucket-wide deletion is used. This fixture does not establish a production egress allowlist or off-host recovery.

A read-only AWS inventory found six existing buckets, none named for GrowthCast; no bucket was selected or changed. [Recovery inventory](recovery-inventory.json) records the limited scope. The next recovery step is a dedicated encrypted archive destination with separate keys and scoped backup/restore identities, followed by a coordinated database/object restore. Existing application storage is not recovery evidence.

The [live-source recovery drill](../managed-recovery/README.md) now restores a read-only Supabase snapshot and synthetic object bytes from the independent archive into isolated local targets. Replacement-project/bucket recovery, managed key escrow, scheduling and application deployment remain separate gates.

## Read-only backup object identity

`backup-policy.sql` is a one-time, transactionally applied upgrade of the original boundary. It checks the original normalized isolation expression and inventory before allowing the two dedicated subjects into the bucket. Four new policies grant the backup subject SELECT and restrict INSERT/UPDATE/DELETE even in the presence of unrelated permissive grants. Both subjects remain isolated from other buckets; the writer still cannot overwrite. Reapplication is refused.

The backup credential is protected in `backup-storage-credentials.json` outside the repository and in version 2 of the existing managed backup-source secret. It contains no writer or administrative key. `backup-live.check.mjs` verifies exact-byte reads, denied insertion/overwrite, survival after attempted deletion, cross-bucket denial, peer isolation and writer regression. A successful DELETE response alone is not accepted as evidence: the original bytes must survive. See [reader evidence](backup-evidence.json).

Fixture setup and cleanup retain the writer in separate containers. The recovery capture overlay mounts only the database reader and object reader. This is still a closed-staging synthetic drill, not an unattended backup job.
