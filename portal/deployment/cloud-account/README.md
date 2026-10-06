# Cloud account and private-file acceptance

The actual packaged Atrium API passes a synthetic account/file flow on Fargate using its version-pinned Secrets Manager auth/origin and restricted database/Storage credentials. No database-owner or migration credentials enter the task. Its existing application role creates and removes only this run's randomly namespaced fixtures; the client checks exercise native HTTP routes. This is a staging acceptance harness, not a public portal service.

The flow passes:

- Expired-invitation denial, invited signup, one captured verification email, invalid-link denial and successful verification.
- Secure session-cookie attributes, invitation acceptance, authorized organization selection, cross-organization and organization-creation denial.
- Native private upload/download, anonymous/cross-project/cross-organization denial and origin-proof enforcement.
- Account session and exact file bytes surviving an application **process restart** with freshly fetched cloud secrets.
- Membership-removal denial for GET/HEAD/Range/download-URL requests, logout, stale-cookie replay denial and existing-account login.

A digest-pinned Maildev sidecar captures only synthetic mail. The compiled mail helper accepts `PORTAL_MAIL_CAPTURE_HOST=127.0.0.1` for the shared task network, or its existing default `mail` for local Compose. Other hosts are rejected; existing `.invalid`/`.test` recipient restrictions still apply. The task has no inbound rules. Browser/HTTPS/proxy acceptance, full task replacement and real outbound email delivery are not claimed.

The driver keeps its generated password, cookies and verification links inside the task. Raw application and HTTP-driver logs are discarded. Secret and connection material is delivered under UID 1000 and removed on shutdown; cookie/driver files are deleted. Mail capture stops with the task. The verifier temporarily enables only `gc_app`, stops the task, disables that login again and deregisters the task definition.

Cleanup lists and deletes only objects under this run's unique project prefixes, then removes its exact project, organization and user fixtures. Source snapshots compare every row digest/count across all **52 Atrium tables** before and after; the accepted run restored the exact original empty-table state. A separate read-only audit repeats that comparison, uses the Storage reader to verify object absence, checks all six application/migration roles are NOLOGIN, and verifies stopped-task/inactive-definition status plus actual code, HTTP drivers, images and task-role bindings.

Evidence:

- `package-evidence.json`: successful account/file flow and pinned images/source hashes.
- `before-state.json`, `after-state.json`: matching source-table digests and object absence.
- `audit-evidence.json`: independent source and task cleanup.
- `fixture.json`, `package-probe-tasks.json`: exact run namespace and task identifiers.

```sh
sh portal/deployment/runtime/build-atrium.sh "$PWD/portal/checkouts/atrium"
GC_SECRET_MODE=materialized RUNTIME_TEST_SERVICE=atrium sh portal/deployment/runtime/test/run.sh
python3 -B portal/deployment/cloud-account/verify.py
python3 -B portal/deployment/cloud-account/audit.py
```

The runner refuses an existing fixture receipt; reconcile and retain any previous attempt before rerunning. It does not alter canonical business records, send real mail, sign documents, create persistent services or configure public ingress. Managed signing, separately scoped proxy proof delivery, HTTPS/browser integration, operational live-secret recovery/rotation, signing certificate provisioning and remaining Phase 2 deployment/operations acceptance remain open.
