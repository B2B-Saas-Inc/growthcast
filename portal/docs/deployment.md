# Secret-free deployment design

Current licensing status: resolved by the [operator confirmation on 2026-09-23](licensing-decision.md), superseding earlier open licensing questions recorded below. Infrastructure and deployment acceptance remain separate.

Status: design for review, not a runnable production stack. No host, paid plan, production image or certificate has been selected. The isolated signing/integration harnesses and [Phase 2 local database foundation](../foundation/README.md) are executable. The foundation supplies frozen migrations, verified database TLS, separate runtime/migration credentials, a schema guard and a disposable restore drill. Its staging/production files are preflight-only; the full service topology below remains a design.

## Topology

```text
public GrowthCast Vercel deployment (independent)
clients.growthcast.app -> TLS edge -> Atrium web/API
                                  -> Atrium PostgreSQL + private storage
                                  -> integration worker (same catalog database)
sign.clients.growthcast.app -> signing gateway -> internal Documenso
                                              -> separate PostgreSQL/storage
                                              -> external signing certificate
provider webhooks -> authenticated ingress -> durable inbox -> worker
```

Only edge HTTPS is published. Staging has isolated test databases/storage, Stripe test mode and captured/allowlisted email. The PDF renderer has no network or host/provider credentials. Application egress is allowlisted per service, including protection against IPv4/IPv6 metadata access, DNS rebinding and redirect-based SSRF. Runtime database roles cannot perform DDL; migration roles are supplied only to explicit migration jobs.

Release images require source provenance, pinned base images, frozen lockfiles, digest references, dependency review and rebuild evidence. `upstream-lock.json` is an investigation lock, not a release manifest. Do not use unpinned upstream images or stock Atrium startup scripts in production.

## Configuration inventory

All secret values are server-only and absent here. Supply them from managed secret storage, never public frontend variables or build arguments.

| Service | Names observed in pinned code/config | Purpose |
| --- | --- | --- |
| Atrium database | `DATABASE_URL`, `DIRECT_URL` | Separate runtime/migration credentials, verified TLS |
| Atrium auth | `BETTER_AUTH_SECRET`, `WEB_URL`, `API_URL`, `SECURE_COOKIES`, `ALLOW_SIGNUPS` | Host-specific cookies; agency signup disabled after bootstrap |
| Atrium storage | `STORAGE_PROVIDER`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Private storage and isolated credentials |
| Atrium mail | `EMAIL_FROM` | Provider and remaining secret configuration still to be selected |
| Documenso database | `NEXT_PRIVATE_DATABASE_URL`, `NEXT_PRIVATE_DIRECT_DATABASE_URL` | Separate database/roles from Atrium |
| Documenso crypto | `NEXTAUTH_SECRET`, `NEXT_PRIVATE_ENCRYPTION_KEY`, `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY` | Distinct managed secrets and restore escrow |
| Documenso origins | `NEXT_PUBLIC_WEBAPP_URL`, `NEXT_PRIVATE_INTERNAL_WEBAPP_URL` | Public gateway origin and private internal service |
| Documenso files | `NEXT_PUBLIC_UPLOAD_TRANSPORT`, `NEXT_PRIVATE_UPLOAD_ENDPOINT`, `NEXT_PRIVATE_UPLOAD_REGION`, `NEXT_PRIVATE_UPLOAD_BUCKET`, `NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID`, `NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY` | Private storage; verify selected driver behavior |
| Documenso signing | `NEXT_PRIVATE_SIGNING_TRANSPORT`, `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH`, `NEXT_PRIVATE_SIGNING_PASSPHRASE` | External certificate; test certificate never promoted to production |
| Documenso mail/jobs | `NEXT_PRIVATE_SMTP_TRANSPORT`, `NEXT_PRIVATE_SMTP_HOST`, `NEXT_PRIVATE_SMTP_PORT`, `NEXT_PRIVATE_SMTP_FROM_NAME`, `NEXT_PRIVATE_SMTP_FROM_ADDRESS`, `NEXT_PRIVATE_JOBS_PROVIDER` | Test mail sink; durable scheduled jobs before release |
| Custom adapters | Names not finalized; implementation pending | API credentials, webhook secrets, grant pepper and session secrets |

A deployable `.env.example` and startup validation belong with the implemented services. Do not invent adapter names and imply upstream support. Portal analytics remain disabled.

## Migration and recovery

Upstream has no checked-in Atrium `migration.sql` baseline. The foundation now freezes and verifies an empty-database baseline against the exact pinned schema, with checksummed adapter/permission migrations and a read-only schema guard. A guarded full-AppModule auth integration now passes under the non-owner role with verified Prisma TLS; production entrypoints and catalog/provider role integration remain outstanding; existing databases require separate reviewed data transformations/RLS preservation. Never use `--accept-data-loss`, swallow migration failures or log connection strings. Keep Documenso migrations separate; the adapter never writes its tables.

Persist webhook receipts before acknowledging delivery. Use durable outbox/effect receipts, worker leases, bounded backoff and dead-letter review. Reconcile uncertain remote writes before retrying. Record provider account/team/environment/organization in bindings. Initial reconciliation targets are every 15 minutes for active records and daily for full inventory, subject to rate limits.

Documenso authentication is a mandatory `X-Documenso-Secret` shared-secret comparison, not an invented HMAC scheme. Use constant-time comparison, TLS, delivery/effect deduplication and authoritative provider read-back. Stripe needs raw-body signature/timestamp validation; subscribed Attio webhooks need its documented HMAC/idempotency handling. The live [Documenso verification documentation](https://docs.documenso.com/docs/developers/webhooks/verification) was rechecked during this run. Never copy fail-open behavior for unset secrets.

Monitor certificate expiry, backup age, synchronization lag, webhook failures, leases, dead letters, storage and mail. Alert destination is undecided. Proposed RPO <=1 hour/RTO <=4 hours remain unproven. Restore disposable databases and object versions together, verifying hashes, bindings and receipts. Protect signing-key recovery separately.

Rollback pauses new sends/claims/billing while retaining durable receipts and authorized signed-document access. Restore an earlier image only with schema compatibility evidence. Never restore an old database over new signed/paid transactions or recreate remote obligations. Legacy proposal rollback is independent; no cutover is activated here.
