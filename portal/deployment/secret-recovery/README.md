# Existing application and signing-secret recovery

This opt-in drill tests recovery of the exact secrets already used by disposable local packages. It uses the existing staging S3 archive bucket, KMS key and separate upload/restore sessions. No staging database credentials, production signing certificate or customer secrets are captured.

```sh
python3 -B portal/deployment/secret-recovery/accept.py
```

The pinned runtime/recovery images and AWS login must already be available. The runner refuses existing receipts so prior results must be reviewed and archived before another run. Dependencies and application tests run in containers.

## What is recovered

| Fixture | Archived files | Application acceptance |
| --- | --- | --- |
| Atrium | Existing application environment (including Better Auth secret) and private origin proof | The account and private file created before loss remain accessible with the existing cookie after container recreation; organization/project denials, membership revocation, logout/replay denial and existing-account login pass |
| Documenso | Existing application environment (including auth/encryption keys), PKCS#12 test certificate and its matching fixture TLS private key | Native and official SDK flows create four sealed PDFs after recovery; OpenSSL verifies all four, followed by restart, route-boundary, expiry and revocation checks |

The signing harness shares its ephemeral self-signed key between HTTPS and PDF signing. All three consumers—provider, gateway and SDK server—are stopped before loss. This fixture does not establish production certificate trust or an acceptable production key-sharing arrangement.

## Recovery boundary

Only correctly labelled disposable Compose volumes and exact synthetic database hosts are accepted. The capture checks the expected synthetic application URLs/mail mode and admits a fixed file allowlist. Database connection files and unrelated volume contents are excluded. A versioned manifest carries exact paths, bytes and hashes inside the authenticated encrypted archive.

Each run uses a new AES-256-GCM data key and context-bound KMS envelope. Uploads are create-only and use exact S3 versions for retrieval. KMS wrong-context, tampered-envelope and unauthorized-role cases must fail. Before retrieval, the original selected files, plaintext snapshot, local encrypted archive and local data key are removed. The separate restore session retrieves the retained versions and unwraps the data key. Wrong-key/tampered archives fail authentication before restoration.

Restoration validates every entry and checks every destination before writing. An occupied-target probe must preserve the sentinel and create no other files. Files are restored byte-for-byte with the fixture's expected permissions. Plaintext archive/key volumes and temporary STS credential files are removed afterward. Full application regressions run before acceptance is marked passed; a transfer receipt alone is insufficient. Compose teardown includes the test profile, and final inventory checks containers, networks and volumes.

## Scope remaining

These are synthetic secrets under the existing staging recovery permissions. Production secret escrow needs a separate reviewed access boundary; ordinary data-restore workers must not implicitly receive production signing/encryption keys. Production certificate sourcing/trust/expiry, managed secret delivery and rotation, recovery of encrypted integration records, and managed signing/deployment acceptance remain open. No production secrets are provisioned by this drill.

`boundary.check.py` exercises refusal of non-fixture project names, a live database hostname, production-labelled bundles and unsafe destination paths without network access. `accept.py --retry-documenso` is a bounded retry for a failed signing run only: it retains the successful Atrium result, requires unchanged recovery/application scripts, and archives the failed receipt before repeating the entire signing suite. A browser crash is never converted into a pass.
