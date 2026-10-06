# Staging signing service commissioning

Migration013 is applied in staging. The existing API remains in staff-review mode with sending disabled. Separate gateway and lifecycle services run under their dedicated ECS/database identities; the native Documenso service remains private. Production and the staging frontend deployment are unchanged.

The existing HTTPS listener routes signing pages and the three required signing API families to the restricted gateway. Staff document routes retain priority2 and native Atrium API routes retain priority10. Every signing request still passes the session-bound provider allowlist. The lifecycle service has no public listener and receives no SMTP settings. Both services use private UID1000/mode0700 volumes, version-pinned secret delivery, verified database TLS/schema guards and120-second shutdown limits.

Verification receipts under `release/staging` cover:

- Baseline backup and independent restore, then migration13 backup and independent restore.
- Local13-migration idempotency, drift refusal, restore-stable fingerprint and restricted app/gateway/lifecycle guards; backup read access to18 guest tables without writes.
- Private provider API authentication plus anonymous/invalid-credential denial, with zero provider writes.
- Gateway and lifecycle health; seven HTTPS route/access checks.
- Ten live admin/client browser checks, sidebar/menus/mobile layout, and sending capability false. Synthetic accounts are removed.
- Restoration of the existing daily recovery schedule.

The first provider probe exposed missing private-port egress; a rule now permits port3000 only to the provider security group. Initial service attempts exposed unreadable packaged files. The runtime images normalize permissions on public code/secret-version identifiers and explicitly declare private writable volumes. No secret values are packaged. The API source-directory repair required an intermediate healthy task while CloudFormation rolled back; the subsequent declarative API update reconciles its task definition. Historical failed-attempt receipts remain for diagnosis.

Normal sending is not enabled by this milestone. Next: mount the API-delivered auth-secret volume and private delivery volume into the staff container, select the delivery entrypoint, verify live controlled-recipient send/input/signature/canonical-PDF attachment and recovery, and then enable the normal staff capability. Reapproval of an already-sent version/recipient intentionally cannot create a second send; resolve the staff retry/reapproval experience before normal activation. The current flow supports one recipient.

Commands are explicit and staging-only: `signing-release.py` handles inventory, images, provider probe, migration, API and recovery; `signing-services.py` handles separate service infrastructure, activation, health and routes. Existing credentials are not rotated on retry. Do not replace successful immutable receipts or apply these templates to production.
