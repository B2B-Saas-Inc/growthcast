# Staging signing credentials

The deployed signing-secret stack contains separate gateway and lifecycle ECS roles, three Secrets Manager entries and a retained, annually rotated KMS key. The existing Atrium role can read only the delivery entry in this stack. Gateway can read only its database connection; lifecycle can read its database connection, provider API credential, delivery decryption key, private Storage credentials and public signing trust certificate. It receives no SMTP configuration. Account root remains the administrative recovery exception.

The provider API credential is copied from its pinned existing secret without changing the provider token or relaxing the provider KMS key policy. Delivery and lifecycle share the durable send encryption key; the recipient gateway does not receive it. The gateway and lifecycle database credentials are initialized with NOLOGIN. No listener, live sending, or migration is enabled by this stack.

Commands (staging only):

```sh
python3 -B portal/guest-documents/deployment/signing-secrets/provision.py template
python3 -B portal/guest-documents/deployment/signing-secrets/provision.py deploy
python3 -B portal/guest-documents/deployment/signing-secrets/provision.py initialize
python3 -B portal/guest-documents/deployment/signing-secrets/verify.py start
python3 -B portal/guest-documents/deployment/signing-secrets/verify.py finish
```

Initialization persists each private value before applying its NOLOGIN password, so an interrupted database step can resume using the same value. It never silently rotates a recorded version. An unrecorded current secret requires reconciliation; do not delete receipts to bypass that check. The three real ECS consumers passed their own pinned secret reads and nine cross-secret denials, including access to the original provider API secret. All probe task definitions were deregistered. A repeated initialization preserved the recorded versions. Receipts contain only identifiers and results.

The candidate image's `signing-start.mjs` selects a fixed gateway, lifecycle or delivery entrypoint from `GC_SIGNING_SERVICE`. Its pinned secret reader requires UID1000 and ECS metadata credentials, writes mode0400 files into UID-owned mode0700 volumes, refuses overwrites and removes its files on shutdown or partial failure. Signing pins are packaged in the image; values never belong in task environment variables. The deployed portal still uses its prior entrypoint and sending remains disabled.

Signing escrow capture and independent recovery now pass; see `../signing-recovery/README.md`. Migration013 and matching backup/restore acceptance are complete. The restricted signing logins are enabled for service commissioning, with distinct task roles and private volumes. The delivery container also needs the existing API auth-secret volume to decrypt Workspace SMTP settings. Complete private provider API verification and live signing/recovery acceptance before enabling normal sending.

Signed-file capacity is now addressed in the candidate API adapter and backup package: downloads and per-object capture permit16MiB while ordinary uploads remain3MiB and total capture remains128MiB. Twenty-one storage/capture checks include a4MiB round trip. The actual API image builds with54 tests passing. The schema13 staging API and recovery release includes these capacity changes. Production remains unchanged.
