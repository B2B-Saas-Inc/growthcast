# Staging runtime secret access and delivery

This foundation provisions separate Secrets Manager entries, customer-managed KMS keys and ECS-only task roles for Atrium and Documenso. It initializes new staging cryptographic material once; it does not enable database logins, deploy application services, rotate existing material or provision a signing certificate.

| Consumer | Material | Access |
| --- | --- | --- |
| Atrium | Better Auth secret and private API origin proof | Its exact secret/version and KMS key through Secrets Manager |
| Documenso | Auth secret and primary/secondary encryption keys | Its exact secret/version and KMS key through Secrets Manager |
| Data backup and independent restore tasks | None of these runtime secrets | Secret reads and KMS decryption denied |

The database backup secret remains separate. No database owner, migration, Storage writer or signing-certificate credential is included here. The account root is the explicit administrative recovery exception in each key and secret policy. Runtime roles cannot read the other application's secret, read the backup secret, write/rotate their own secret, or decrypt directly through KMS. ECS trust is restricted by account and source ARN. Key rotation is enabled; keys and secrets are retained on stack deletion/replacement. Key rotation does not rotate application secrets.

`deploy.py` prepares an add-only CloudFormation change set and records its resource changes before execution. It refuses an existing deployment/secret version rather than silently rotating live authentication or encryption keys. New values exist only in protected temporary files and process memory during provisioning; only ARNs/version IDs enter receipts. Both values are read-back verified.

`material.mjs` validates exact service-specific fields and random-secret formats before writing. It requires a fresh absolute destination, creates a mode-0700 directory, and writes mode-0400 files using exclusive creation. Unknown fields (including database credentials), wrong services, wrong versions and occupied targets are rejected. Origin proof is separated from the application secret environment file. Files belong to the materializing process; deployment must run that process as the application's UID or provide an explicitly reviewed ownership handoff.

`verify.py` launches four one-off non-root Fargate tasks using the existing digest-pinned SDK image and task credentials. Each application role retrieves its exact version and materializes private files, checks equality/permissions, proves four denials and removes the plaintext. Separate probes under the actual backup and restore task roles each prove four runtime-secret/key denials. No secret values are placed in task definitions, environment variables or logs. Probes use the existing HTTPS-only security group with no ingress and ephemeral work volumes; task definitions are deregistered afterward.

```sh
docker run --rm -v "$PWD/portal/deployment:/config:ro" growthcast-infra-validator runtime-secrets/foundation.json
python3 -B portal/deployment/runtime-secrets/deploy.py
python3 -B portal/deployment/runtime-secrets/verify.py
```

The startup wrapper now supports strict private-file consumption; see `../runtime/README.md`. Actual cloud delivery into those application containers, database/Storage credential delivery, a separately scoped web-proxy origin-proof handoff, rotation/recovery procedures, signing-certificate provisioning and staging deployment remain open. This is a live staging access boundary, not a production portal deployment. The earlier secret-recovery fixtures remain synthetic and are not substitutes for escrow/recovery of these newly provisioned versions.

The live delivery run passes in `evidence.json`; `audit.py` checks deployed key policies, rotation, exact secret versions, role permissions/trust and probe cleanup. Direct-decrypt probes use valid ciphertext containing a non-secret canary, so input-format rejection cannot masquerade as an authorization denial. The initial probes used dummy ciphertext and failed assertions without sufficiently specific diagnostics; their task identities are retained separately. Policies were not relaxed.

## Application-image delivery

`GC_SECRET_MODE=secretsmanager` now invokes `deliver.mjs` from the application's startup wrapper before database verification. `runtime-pins.json` fixes the staging secret ARN, version and application UID. Retrieval uses only ECS container credentials and the fixed US East Secrets Manager endpoint. Static credentials, profiles, full credential URLs, wrong UIDs and mismatched response versions are refused. AWS task credential settings are not forwarded in the child process environment.

Both packages include the existing locked AWS SDK dependency set. Each has private writable task volumes at `/run/delivered` and `/run/origin`, owned by its application user. Delivery writes `/run/delivered/material` and, for Atrium, a separate private origin-proof file for the existing ingress middleware. Configuration and database files remain separate read-only mounts. The strict private-file reader checks the delivered material before the application starts. Normal child exit, launch failure and guarded-startup failure remove delivered files. Occupied destinations fail closed; after an abrupt task termination, replace the task with fresh ephemeral volumes rather than reusing incomplete delivery state.

`package-verify.py` publishes both actual application images by digest to the existing staging ECR repository, then runs their delivery and private-file consumption code under the separate ECS application roles and native UIDs. It does not start application servers or enable database logins. Only bounded metadata reaches logs. Task definitions are deregistered after the checks. Existing backup services, schedules and runtime-secret policies are not changed.

```sh
sh portal/deployment/runtime-secrets/check.sh
python3 -B portal/deployment/runtime-secrets/package-verify.py
```

The local checks use injected synthetic responses; the package probe uses real task-role retrieval. Full cloud application startup still requires database/Storage configuration delivery and managed application acceptance. The server-side web proxy must receive its origin proof through a separately scoped mechanism; it must not receive the entire Atrium secret.
