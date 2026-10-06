# Staging foundation operations

**Production update — 2026-09-25:** Phase 2 is now deployed at https://clients.growthcast.app with the staging setup migrated into a separate production environment. Staging remains independent. Existing account passwords are unchanged. See the [production release and operations record](../production/README.md). Earlier staging-only and deferred-production statements below are historical; Phase 3 document work remains next.

## Runtime identity recovery

Current exact-version application and connection pins live in `../runtime-secrets/runtime-pins.json` and `../runtime-connections/pins.json`. The signing-certificate version is in `certificate.json`. The encrypted recovery locator is `escrow-locator.json`; it contains no plaintext key or credential. Archives use `runtime-escrow/` outside the data-backup roles' `staging/` permissions, a separate KMS key, authenticated AES-GCM, exact S3 versions and context-bound key wrapping.

The secret-recovery role can read escrow objects and decrypt only with the escrow purpose context. It cannot retrieve source Secrets Manager entries, upload/overwrite archives, or change source data. The bootstrap IAM user can only assume that role; it retains no access key. Operator/root recovery remains the explicit administrative exception. Keep the escrow KMS key and source-version locators for as long as any retained database backup can contain data encrypted with those versions.

Recovery drill: retrieve exact ciphertext/wrapped-key versions; verify SHA-256; unwrap using the recorded context; authenticate the archive before reading it; reject an occupied plaintext destination. Run the application guard and encrypted-settings read check using recovered material. Restore into a fresh isolated runtime before changing a live pin. Never substitute a new auth/encryption key for a lost key: existing integration settings, sessions and signed records depend on the original material.

The closeout drill removes its original working copies before scoped recovery, decrypts actual encrypted staging settings, and runs both real application packages in isolated networks with recovered keys. It does not delete the live Secrets Manager versions or disrupt live sessions to manufacture a loss scenario. Temporary plaintext files and fixture volumes are removed afterward.

## Rotation

KMS envelope keys have automatic annual rotation enabled; old ciphertext remains recoverable. Staging signing material is version-pinned and separate from TLS. Issue a new certificate version before expiry, archive both versions, verify the new certificate in a private provider task and signing fixture, then promote the new pin. Retain old certificates/keys according to signed-record and recovery policy. The current self-signed certificate is for staging integrity tests, not public production trust.

Atrium derives its settings-encryption key from BETTER_AUTH_SECRET. Blindly replacing that value would make saved SMTP/Stripe/payment settings unreadable and invalidate sessions. The closeout rehearsal uses the production SettingsService implementation to decrypt actual read-only encrypted settings and re-encrypt/decrypt under a fresh key in memory, including wrong-key denial. No real Stripe key, SMTP password or login secret is rotated by this drill. A future live application-key cutover must freeze settings writes, escrow original material, re-encrypt every encrypted settings column transactionally, coordinate pinned application versions, explicitly handle session invalidation, verify every setting, and keep a paired data-and-key rollback. Do not roll back only one side. A live auth-key replacement is not required to demonstrate safe staging recovery.

## Capacity and recovery boundaries

Daily staging backups run at 06:00 UTC. Independent restoration and hourly freshness checks are enabled; the freshness alarm threshold is 30 hours. Current measured backup-to-verified-restore duration is in `operations-evidence.json`. The configured capture limit is 256 MiB; per-stage timeout is 30 minutes and total workflow timeout is 65 minutes. Archive-size/file-churn conflicts fail closed instead of publishing a false success. Locks are released only by their owner after verification; failed/aborted runs retain a lock for explicit inspection through `../backup/orchestration/release-failed-lock.py`.

This proves the current staging workload and bounded recovery mechanism. It does not establish a production capacity or uptime promise. Phase 7 must approve and load-test production sizing, capture under sustained file churn, full service recovery time, and the proposed <=1-hour RPO / <=4-hour RTO. Current daily staging backups do not satisfy a one-hour RPO. Replacement managed-project, storage ACL and restored application evidence is retained under `../replacement-recovery/`.

## Deployment and rollback

The private `B2B-Saas-Inc/growthcast-client-portal` repository contains pinned overlays and testable deployment configuration, separate from the marketing site. CI builds from clean pinned upstream sources and tests disposable database migrations/recovery and security boundaries without cloud credentials. Deployments remain explicit operator-run actions through reviewed staging change-set/alias scripts; CI cannot deploy production or access credentials.

Before a schema change, preserve historical image/manifest/restore receipts; apply reviewed additive migrations with a time-bounded migration login; publish compatible API and recovery images; verify the complete backup-to-restore workflow; disable the migration login. Never run the upstream destructive schema-push startup. Current runtime and restore images must carry all eight Atrium migrations. Retain historical restore image bindings for historical backups.

The Vercel frontend remains protected; the API requires the origin proof. Native Documenso routes are not public. Future guest routes, provider lifecycle integration and invoice webhooks belong to their dedicated later phases. The known Stripe staging webhook authentication blocker must be fixed before end-to-end payment acceptance; a selectable payment method is not proof of payment completion.
