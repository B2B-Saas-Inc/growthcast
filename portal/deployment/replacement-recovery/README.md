# Replacement Supabase project recovery drill

This bounded drill restores the retained three-object synthetic archive into a new temporary Micro project in B2B SaaS Inc., then deletes that project. It does not restore over staging, switch application traffic, or change the daily backup workflow.

The runner downloads exact receipt/archive/envelope versions from S3 through the independent restore role, unwraps the data key through context-bound KMS, verifies SHA-256 and authenticated decryption, and checks the archive manifest before restoring data. The project is created with a unique drill name. Target guards reject the source reference, malformed references, missing recovery intent and occupied private schemas.

Each container receives an immutable, checksum-verified configuration snapshot in a temporary protected directory. Source credentials are not mounted. Target credentials and existing-token revocation probes stay in that temporary directory and are removed afterward. Archive keys and decrypted data live in disposable Docker volumes, which cleanup removes.

## Database and storage checks

The target uses verified TLS and recreates the private schema/role boundary before restoring both application dumps. Row digests/counts, table ownership/effective ACLs and both migration fingerprints must match the archived manifest. Temporary target-only application logins test actual restricted sessions and privilege-escalation/cross-schema denials, then return to NOLOGIN with passwords removed. A second restore must fail before writes.

The drill recreates the private bucket and separate writer/reader Supabase Auth identities with fresh passwords and UUIDs. The reviewed nine-policy boundary is bound to the new identities. Original object keys, bytes, hashes and content types are restored through the Storage API; platform object IDs/owners are newly assigned. Platform-owned `auth` and `storage` schemas are not overwritten or transferred to application roles.

Live tests cover reader downloads, writer overwrite refusal, reader write/delete refusal, anonymous denial and private-schema Data API denial. The reader's policy is revoked while retaining an already issued token: reads must fail while writer access survives. Reinstating the policy restores reader access. Only empty `portal_api` is exposed to the Data API; TLS enforcement and asymmetric signing/legacy-key hardening are applied to the target.

## Run and evidence

```sh
# Existing pinned recovery images must be available.
python3 -B portal/deployment/replacement-recovery/boundary.check.py
python3 -B portal/deployment/replacement-recovery/run.py
```

The runner refuses an existing successful receipt or unreconciled in-progress drill. A subsequent drill requires reviewing and archiving prior evidence explicitly. It captures results before cleanup, tolerates bounded management API rate limits and waits for deletion to disappear from project inventory. Evidence contains only operational metadata; credentials and plaintext archive keys are excluded.

The initial attempts exposed a mutable configuration handoff problem, a signing-key rate limit and asynchronous deletion visibility. These are recorded in the attempt history. The final runner uses immutable configuration snapshots, bounded retries and deletion polling. `evidence.json` records the complete successful run; earlier attempt receipts remain historical.

The original receipt verifies replacement managed database/bucket/service-identity recovery. The separate application mode below extends acceptance to packaged startup and synthetic account/file flows. Production-volume capacity, operator RPO/RTO acceptance, signing-secret recovery, runtime secret distribution and portal deployment remain separate gates.

Platform references: [backup restore scope](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore), [platform schema ownership](https://supabase.com/docs/guides/platform/permissions), [management SQL](https://supabase.com/docs/reference/api/v1-run-a-query), [project deletion](https://supabase.com/docs/guides/platform/delete-project).

## Packaged application recovery check

```sh
python3 -B portal/deployment/replacement-recovery/run.py --applications
```

This mode retains the original database/storage receipt and writes a separate `application-evidence.json`. It repeats the entire replacement restore before temporarily enabling only the replacement project's `gc_app` and `gc_documenso` roles. Each packaged service receives its own credential and verified CA; the Atrium API also receives only the replacement writer identity and private origin proof. Containers run non-root with read-only roots, dropped capabilities, no published ports and discarded application logs. The mail sink and HTTP drivers have an internal-only network; application containers have outbound access to the replacement database/storage services. This is a recovery harness, not production egress enforcement.

The existing packaged API tests exercise private ingress, anonymous/uninvited/expired-invitation denial, invited signup, captured synthetic verification mail, organization isolation, private file upload/download, session and file persistence across full container recreation, project-membership revocation, logout/replay denial and existing-account login. Both packaged services must pass database health before and after recreation. Test fixtures are inserted only after archived row/owner/ACL comparisons pass. Application passwords are removed and roles disabled before target deletion; Compose containers, networks and session volumes are removed on success or failure.

App authentication/encryption secrets are newly generated for this bounded test. It does not establish recovery of pre-existing sessions, encrypted integration credentials or a production signing certificate. Documenso signing and production-volume recovery remain separate acceptance work. Source staging is not modified.

The complete application run passes in `application-evidence.json`, including both real packaged guards rejecting zero-row writes inside their read-only transactions. The failed startup attempts are retained in the attempt history: the original guard observed `transaction_read_only=off` on a reused managed connection and refused launch. The final packages explicitly begin/roll back read-only verification transactions and leave application session defaults alone. Both services subsequently pass startup/recreation, and the API's synthetic account and managed-file flows pass. Run `python3 -B portal/deployment/replacement-recovery/audit.py` for an independent resource inventory and source-role check.

The independent inventory caught one synthetic session volume retained by Compose because its test profile was inactive during teardown. That exact volume was removed, and teardown now explicitly activates `--profile test`. `cleanup.check.py` reproduces the former retention and verifies the corrected removal without any cloud access; `cleanup-evidence.json` binds the amended runner. The original full-flow receipt retains its execution-time source hashes and records this cleanup reconciliation. The final independent inventory confirms zero drill resources and all six source application/migration roles still disabled.
