# All-object source capture

`capture.mjs` is the source-reading command for the future backup workload. It does not create fixtures, delete source files, restore over a source database, or enable application logins. It mounts only `gc_backup`, the verified Supabase CA and the separate Storage reader. The existing closed-staging single-object drill remains available for its original acceptance scope.

## Consistency

A session advisory lock excludes another cooperating capture in this project. One exported repeatable-read, read-only PostgreSQL snapshot supplies both private-schema dumps, row/ACL catalog evidence, Storage metadata and Atrium file references. Application data writes can continue: transactions committed after the snapshot are intentionally absent from both dumps. Migration/schema changes during a backup are not supported and must remain separately coordinated.

The command inventories every object in the fixed private bucket, including objects without an application reference. It verifies that every non-null upload `storageKey`, update `image_key`, branding `logoKey` and response `signatureImageKey` resolves within that snapshot. The complete private-schema dumps also retain provider data and canonical bindings.

Each object is downloaded using the read-only Auth identity. Its byte length must match snapshot metadata; SHA-256 binds its bytes to the manifest. After the database dumps finish, a fresh metadata query must exactly match the snapshot inventory. Object deletion, addition, replacement with a new ID, or metadata changes cause the whole attempt to fail, releasing the lock and deleting incomplete local output. The existing restrictive no-overwrite Storage policy is part of this consistency boundary; administrative bypass or direct modification of the underlying object backend is outside it.

This is optimistic consistency checking, not a writer pause. High file-write activity may prevent an attempt from succeeding. A future scheduler must report/retry failed captures without treating them as usable backups. Neither an upload receipt nor `CAPTURED` establishes successful independent restoration.

## Version 2 archive

The manifest has `schemaVersion: 2`, an object array containing original IDs/keys/metadata, generated archive paths, sizes and SHA-256 hashes, plus the captured application references. Object bytes use generated hexadecimal archive filenames; source object keys never become tar arguments. Original keys are preserved when restoring into the isolated private volume. All object hashes and reference bindings are checked before any object is written. Restore refuses an occupied target, and restored application logins remain disabled even if the source snapshot recorded enabled logins. The verifier still supports the prior unversioned single-object archives.

Bounded staging capacity is 10,000 objects, 3 MiB per object, 128 MiB of object bytes, and a total archive below the existing 256 MiB encryption limit. Oversized captures fail; no partial/truncated inventory is accepted. Database catalog aggregation and archive encryption are still bounded-memory implementations, not production-scale streaming jobs.

## Manual verification

No source mutation:

```sh
PORTAL_OFFHOST_RECEIPT=/tmp/growthcast-all-object-transfer.json \
sh portal/deployment/backup/recovery-check.sh
```

Explicitly opt into a three-object staging acceptance fixture (requires an initially empty bucket):

```sh
PORTAL_OFFHOST_RECEIPT=/tmp/growthcast-multi-object-transfer.json \
sh portal/deployment/backup/multi-object.check.sh
```

The fixture writer runs separately, journals its three unique keys before uploading, and deletes only those keys afterward. It never enters the capture container. On cleanup failure the journal volume is retained.

`capture.check.mjs` tests multiple/empty objects, missing bindings, additions/deletions/same-name replacements, download failures, unsafe keys, size bounds, concurrency, target preservation and tamper refusal. `snapshot.check.sh` uses real PostgreSQL: it commits writes before each dump, restores both dumps, and proves that both contain the same earlier rows. Both checks are in `deployment/check.sh`.

The live acceptance captures the actual staging private schemas and separately seeded synthetic object bytes; it is not evidence of customer-data scale or a deployed workload. [Evidence](capture-evidence.json) records results and limits.

## Remaining workload work

The [digest-pinned non-root ECS job](job/README.md) now retrieves the version-2 secret, captures/encrypts/wraps/uploads with its task role, persists versioned upload receipts and emits a success metric; its archive is independently restored. Durable independent verification records and the separate hourly monitor are now deployed; see [monitoring](verification/README.md). Recurring backup execution and unattended restore validation remain open. SNS notification routes to the confirmed operator are enabled; the labeled test was accepted by SNS, with inbox receipt confirmed by the operator. Replacement Supabase project/bucket/Auth/RLS recovery and restored application startup also remain open.

Current staging operations: daily backup at 06:00 UTC followed by independent restore is enabled and passes real scheduler acceptance. See [orchestration](orchestration/README.md). Earlier one-off evidence records the schedule state at its capture time.

### Stable row checksums across database locales

New captures mark `catalogFormat: "bytewise-v1"` and sort serialized rows with PostgreSQL `COLLATE "C"` before hashing. The manifest selects this format explicitly; historical unmarked manifests retain their original comparison mode. This avoids differences between Supabase's locale sorting and the isolated Alpine restore database. The release preflight reproduced a session-table digest mismatch with identical rows; Supabase's bytewise digest matched the restored digest. `catalog.check.sh` verifies matching proofs across libc and ICU databases and confirms changed row values still fail comparison.

Candidate signing release (2026-09-26): per-object capture/download limit increases to16MiB for sealed PDFs, retaining the128MiB total and10,000-object bounds. A4MiB capture/restore and the existing inventory/tamper checks pass. This change is not deployed; release it with the signed-file API and migration013 recovery packages.
