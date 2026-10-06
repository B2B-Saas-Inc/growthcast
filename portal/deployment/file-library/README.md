# Upload-only documents and reusable Library

Implemented separately from the guest-document/signing work. Staging and production have passed live API/browser and independent recovery acceptance. See `release/` for environment-specific receipts.

With neither a signature, approval nor choice requested, a newly uploaded contract is `uploaded`, not `pending`. The upload form offers **Upload file**, makes it available in project Files, and sends no notification. Signature/approval requests retain their draft/send workflow. Uploading or restoring a version of an uploaded record preserves its status.

Managed migration 009 corrects untouched pending records that have no requested action, response, signing field/token, signed artifact or provider ownership. It records an audit event and disables reminders/expiry on those records. It preserves completed history, intentional drafts and Documenso-owned records. An externally executed PDF is not falsely marked as having been electronically signed by the portal.

The admin **Library** stores reusable workspace originals privately. **Project → Files → Add files → From Library** adds a separate file copy available to that project's assigned clients. Sharing does not send email or create a signing request. Concurrent retries produce one copy per original/project. Removing a project copy permits it to be added again. Archiving an original removes it from the Library while preserving existing project copies. Originals are immutable; upload a new file for a revised SOP.

Supported formats include PDF, Word, Excel, Markdown, CSV, HTML, text, presentations, OpenDocument and images. The per-file limit is 2 MiB (also subject to the configured workspace limit), leaving room for multipart headers within the existing 3 MiB proxy request limit.

HTML opens in a modal from the Library and both admin/client project Files. The preview uses an opaque sandboxed iframe with no script, same-origin, form or popup privileges. A restrictive CSP and inert markup filtering preserve static inline styles and embedded data images while excluding active content and external resources. Direct HTTP file responses remain attachments; the UI fetches authenticated bytes into the isolated preview. HTML is never inserted into the parent application DOM. Other formats retain the existing download behavior.

The Library has a fresh database-backed staff/session check in addition to the portal's authentication boundary. Clients cannot list/read originals or share/archive entries, even after an admin role is removed while middleware still has a cached session. Project copies use existing project membership authorization. Scoped queries, bounded reads and stored hashes protect organization isolation and byte integrity. Original records and bytes remain retained after archival and are included in backup capture. This does not claim malware scanning; that remains part of the separate document-ingestion work.

## Verification

Use containers; no host packages are required:

```sh
sh portal/deployment/runtime/build-atrium.sh "$PWD/portal/checkouts/atrium"
sh portal/deployment/file-library/build-web.sh
# Browser tool container (same pinned recipe already used for portal reviews).
docker build -t growthcast-portal-browser portal/deployment/web-app -f portal/deployment/web-app/Dockerfile.browser
LIBRARY_BROWSER=1 sh portal/deployment/file-library/run.sh
```

The test uses actual packaged API, signed Better Auth sessions, synthetic local email capture, private local storage, verified PostgreSQL TLS, and a local HTTPS frontend/proxy. Migration cases execute in a transaction that rolls back. Only synthetic test data is used; no cloud writes or real emails occur. Containers and database/storage/credential volumes are removed on exit. Screenshots contain synthetic data and are written to the reported temporary directory.

## Release requirement

Migration 009 changes the managed schema guard and introduces Library object references. A deployment must coordinate the API/frontend and updated nine-migration backup/restore images, and verify a Library object restore before cutover. Existing eight-migration runtime/recovery images must not be restarted against the new schema. Staging and production remain independent. The guest-document candidate schema is not included in this feature's release.

[CI 36198573829](https://github.com/B2B-Saas-Inc/growthcast-client-portal/actions/runs/36198573829) passed for `83e35abc9fb965fe6d4299ca18dbfc0758e449af`. The separately verified local frontend/browser evidence is recorded in `validation.json` and `browser-evidence.json`. Review: [PR #2](https://github.com/B2B-Saas-Inc/growthcast-client-portal/pull/2). The original implementation passed that CI run before rollout; subsequent release checks and fixes are recorded under `release/`.


## Coordinated rollout

`release.py` pins builds, frontend deployments, baseline recovery and migration targets. `recovery-release.py` restricts CloudFormation changes to recovery task images and workflow pins. `rollout.py` drains writes for migration, deploys the matching API, switches the frontend, verifies recovery and restores the original schedule. `live-review.py` uses a random synthetic workspace and normal admin/client login, then deletes its rows and private objects. Existing account passwords are unchanged.

The preflight exposed locale-dependent row checksums in the existing recovery verifier. Staging was repaired on schema 8 and successfully restored before migration 009. New captures explicitly select bytewise row ordering; historical unmarked manifests retain their original format. No schema guard or row equality check was relaxed.

When an API restart returns an infrastructure HTML error page, the same-origin proxy now returns a readable JSON retry message, preserving the HTTP error status. The admin sidebar order is Overview, Projects, Calendar, People, Reports, Library, Settings.

**Release accepted — 2026-09-25 (EDT):** both environments run migration 009 and the matching API, frontend and recovery images. Six live browser checks pass per environment, including the requested sidebar order. Both independent restores pass; test workspaces and objects are removed. Daily staging and 30-minute production recovery schedules are enabled. Existing admin/test-client passwords are unchanged. See [`release/current.json`](release/current.json).
