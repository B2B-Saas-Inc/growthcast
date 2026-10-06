# Staging application connections

Status: live provisioning, restricted managed application startup and independent cleanup acceptance pass. See `deployment.json`, `policy-audit-evidence.json`, `package-evidence.json`, `recovery-denial-evidence.json` and `cleanup-audit-evidence.json`. Both actual application servers started on Fargate and passed loopback health with cloud-delivered credentials. All temporary tasks are stopped, task definitions inactive and all six application/migration roles are NOLOGIN again. No public ingress or persistent application service was deployed.

The initial attempt stopped before mutation because AWS authentication expired; `local-evidence.json` retains that earlier status. After reauthentication, both version pins were provisioned and included in newly published application images.

The six-resource CloudFormation change creates separate retained Atrium and Documenso connection secrets, resource boundaries and exact-secret inline policies on the existing application task roles. It reuses each application's own rotating KMS key. Authentication/encryption secrets remain separate. Other applications and backup/restore roles are explicitly excluded from connection-secret reads; account root remains the administrative exception. No owner, migration or backup database credential enters the payload.

`deploy.py` initializes random SCRAM passwords for `gc_app` and `gc_documenso` while both roles remain NOLOGIN. It preserves their existing grants. Each secret contains its exact restricted PostgreSQL URL and pinned public TLS CA; only Atrium also receives the existing bucket-scoped Storage writer identity. Protected temporary payloads are removed after initialization; password values are not written to evidence or logs. Version IDs are read-back verified and saved to `pins.json`. An existing deployment is refused rather than silently rotating credentials. A partially completed deployment requires reconciliation using its retained metadata.

`deliver.mjs` validates exact fields, project, application role, CA digest and Storage identity/bucket before creating mode-0400 files in an application-owned mode-0700 directory. Retrieval uses only ECS task credentials and exact secret versions. Missing pins, malformed payloads, exposed directories, occupied destinations and version substitutions fail closed. The public certificate in `public-database-ca.pem` makes the offline tests reproducible; it contains no private key or password.

The startup wrapper's `GC_SECRET_MODE=secretsmanager` now requires both cryptographic and connection delivery. It reads database files from `/run/connections/material`, Atrium Storage credentials from `/run/storage/credentials.json`, and explicit non-secret application settings from `/run/config/application-env.json`. It retains restricted TLS/schema verification and excludes inherited AWS settings from the application environment. Writable delivery volumes are private to the task. Normal shutdown and guarded startup failure remove the delivered files.

`verify.py` has passed the bounded live check. After checking provisioned pins against both rebuilt images, it publishes digest-pinned packages, temporarily enables the two application logins, and runs isolated Fargate tasks with no inbound rules. The probe checks both schema guards, cross-schema/system-catalog denial and Atrium's Storage identity, then starts each real packaged application through the cloud-delivery wrapper and checks loopback health. Application logs are discarded. It creates no accounts or documents, performs no signing and configures only synthetic mail destinations. Cleanup stops tasks, disables application logins and deregisters temporary task definitions. The failure cleanup also attempts to disable logins. This is not public deployment acceptance.

```sh
sh portal/deployment/runtime-connections/check.sh
python3 -B portal/deployment/runtime-connections/deploy.py
# Rebuild both runtime packages after version pins are provisioned.
docker build -f portal/deployment/runtime/Dockerfile.documenso -t growthcast-documenso-runtime portal
sh portal/deployment/runtime/build-atrium.sh "$PWD/portal/checkouts/atrium"
python3 -B portal/deployment/runtime-connections/verify.py
```

Both application roles are denied the other connection secret. Separate actual backup and restore task-role probes pass all four connection-secret read denials; policy auditing confirms exact own-secret/KMS-context permissions. The application probes also pass both schema guards and four cross-schema/system-catalog denials. Atrium authenticates the expected scoped Storage writer, and its native private ingress rejects a request without origin proof. Delivered plaintext is removed after application shutdown. Independent inspection confirms all four tasks stopped successfully, definitions inactive, matching source hashes and six disabled database roles.

Cloud account/file/signing flows, separately scoped web-proxy credential delivery, live-secret recovery/rotation, signing certificate provisioning, production-volume/RPO/RTO acceptance and public staging deployment remain open. Storage authentication and server health alone do not establish the complete user flow.
