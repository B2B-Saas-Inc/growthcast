# Managed runtime startup boundary

`start.mjs` is a startup wrapper prepared for the Atrium API and Documenso service packages. Pinned Documenso and Atrium API packages now integrate it; no service is deployed. Gateway/worker packaging remains separate work.

Each container must mount only its own `database-url`, `database-ca.crt`, and `application-env.json` under `/run/secrets`, readable by its non-root runtime user. Set `GC_SERVICE` to `atrium` or `documenso` and `SUPABASE_PROJECT_REF` to the dedicated project. Supply an absolute application executable and arguments:

```sh
node /app/deployment/runtime/start.mjs /usr/local/bin/node /app/build/server/main.js
```

The illustrated application path is the pinned Documenso server entrypoint. Atrium packaging must supply its compiled server path. Do not pass either upstream migration entrypoint. Include this deployment directory's managed migrations/manifests and pinned `pg` dependency in each package: the wrapper verifies their checksums before launching the application.

Startup requires the exact runtime role (`gc_app` or `gc_documenso`), PostgreSQL 17, verified TLS, the expected private namespace, no elevated role flags or memberships, and the complete managed schema guard. The guard connection is read-only and closes before launch. No migration or role mutation runs here. Prisma receives the same scoped credential with a private schema and strict certificate verification; application connections can perform the writes allowed by their existing database grants.

The child receives only the explicit string-valued application environment plus generated database variables. Inherited process variables are not forwarded. Database overrides, cloud credentials and Node/TLS injection settings are rejected; `NODE_ENV` is allowed. The application configuration file may contain service secrets and must be managed like the database credential. Provision service integrations through narrowly scoped mounted secrets as packaging is completed. Do not mount administrator/migration credentials in runtime containers. This wrapper does not sandbox the child or sanitize application logs; those remain packaging review requirements.

Tests in `runtime.check.mjs` cover configuration and startup orchestration using a simulated database adapter. The underlying real schema guards already have separate managed integration coverage; the provider integration below adds actual-image coverage on an isolated database. Managed staging verification and Atrium image integration remain outstanding. No live runtime credentials were provisioned for these tests.

## Packaged provider verification

Build and exercise the provider from the repository root:

```sh
docker build -f portal/deployment/Dockerfile.supabase -t growthcast-supabase-preflight portal
docker build -f portal/deployment/runtime/Dockerfile.documenso -t growthcast-documenso-runtime portal
sh portal/deployment/runtime/test/run.sh
```

The package extends the existing digest-pinned ARM64 Documenso image without changing its application or licensing files, installs the locked boundary dependencies separately, and replaces the upstream migration entrypoint with the checked startup wrapper. An explicit build-context allowlist excludes local checkouts, artifacts, test fixtures and secrets. Registry publication and other CPU architectures remain unverified.

The disposable integration uses PostgreSQL 17 with SCRAM passwords, a generated TLS certificate, the complete 166-step managed history, and the actual provider server. The database's Supabase-shaped hostname resolves only inside the internal Docker network; no Supabase project is contacted. Only the provider runtime credential, public CA and explicit application configuration are mounted in the non-root, read-only provider container. Administrator credentials and the database TLS private key are separate mounts available only to setup/database services. Provider logs are discarded because upstream logs can include bearer tokens. All fixture volumes are removed on exit.

The integration verifies provider health (including its real Prisma query), restart, rejection of deliberate schema drift, and healthy restart after repair. Drift refusal is bounded to 30 seconds. No signing certificate is supplied, so certificate health remains a warning; this test does not assert signing acceptance. Earlier native/SDK signing evidence uses the separate managed gateway harness. The separate signing regression below now covers this package. Atrium/API packaging, managed secret provisioning and remote deployment remain open.

## Packaged signing regression

```sh
sh portal/deployment/runtime/test/signing.sh
```

This overlay runs the existing native/official SDK browser suite against the packaged provider with TLS/SCRAM, its private managed schema, and a mounted ephemeral signing certificate. It retains the separate local gateway database and captured internal SMTP. All networks are internal; fixture credentials, documents and certificates are deleted with their volumes on exit. Bootstrap and verifier code accept only the original disposable database or the exact synthetic hostname plus restricted role/schema/strict TLS settings; the real staging project is rejected.

The full rerun passed 33 gateway tests, desktop/mobile SDK callbacks, four OpenSSL-verified final PDF signatures, canonical artifact reconciliation without signer accounts, actual provider/gateway restart, 588 route-boundary denials, expired sessions and 45 revoked-request replays. See [source-bound evidence](signing-evidence.json). The initial attempt hit Chromium SIGSEGV before signing; a complete fresh rerun passed. No application workaround or test suppression was added. Generated audit PDFs remain unsigned, as already characterized in the gateway suite. This is local package evidence, not a managed staging deployment or off-host recovery result.

## Packaged Atrium API

```sh
sh portal/deployment/runtime/build-atrium.sh "$PWD/portal/checkouts/atrium"
RUNTIME_TEST_SERVICE=atrium sh portal/deployment/runtime/test/run.sh
```

The builder checks the pinned clean revision and admits only its Git archive. Build dependencies compile the real Nest API and Prisma client; a separate frozen production dependency install supplies the runtime. The final image contains the API build, needed workspace modules, generated Prisma engine, upstream license and database wrapper. It excludes checkout environment files, API test bootstrap and `@nestjs/testing`. Bun is used because the pinned workspace packages export TypeScript. No test-module overrides replace production services.

Supply the standard Linux `PATH`, including `/usr/sbin` and `/sbin`, in the explicit application environment: Prisma uses `ldconfig` to detect the installed OpenSSL library. Omitting those directories caused the first package attempt to select the wrong engine ABI. Bun injection environment settings are now denied alongside Node settings.

The real API passes database health, disabled billing/open signup, four anonymous private-route denials, uninvited signup denial, restart, schema-drift refusal and post-repair health/HTTP checks. The container is non-root and read-only, mounts only its runtime secrets, and runs on an internal test network with no published port. See [Atrium evidence](atrium-evidence.json).

This is a native API package candidate, not the completed portal API. Provider-owned document/catalog adapters, managed storage/recovery, deployed proxy/HTTPS acceptance and log redaction remain release work. The smoke fixture uses ephemeral local storage, the internal capture mail service, disabled billing, and discarded raw logs. Existing account/catalog tests use the earlier foundation harness and must not be substituted for package acceptance.

## Packaged account and staging mail flow

The Atrium build applies a checksum-guarded patch to the pinned `MailService` and compiles `capture-mail.ts`. `PORTAL_MAIL_MODE=capture` routes all application mail to the internal `mail:1025` sink before organization settings are considered. Only one plain address ending in `.invalid` or `.test` is accepted; external addresses, recipient lists and header injection are rejected. Unknown mail modes fail startup. With the setting absent, the original delivery behavior remains. No test-module provider replacement is used. The upstream checkout is untouched; the patch runs on its isolated Git archive during the image build.

The Atrium runner now tests expired/uninvited signup denial, invited signup, one captured verification email, tampered-link rejection, verified session state, native invitation acceptance, organization selection, cross-organization and organization-creation denial, API restart persistence, logout, revoked-cookie replay denial and existing-account login. It also checks secure session-cookie attributes. Pinned Better Auth clears the active organization after a denied selection; the test asserts this and reselects the authorized agency before restart.

All messages and session evidence are synthetic and confined to disposable internal Docker networks/volumes. The driver handles cookies explicitly over internal HTTP; it does not replace browser/HTTPS proxy testing. Production delivery setup, the portal catalog/provider adapters, managed storage/recovery and deployment remain open.

## Private API ingress and artifact persistence

The API entrypoint installs a middleware before controller handling, using the existing `api-origin.mjs` helper with a build-time TypeScript signature adaptation. Its separate read-only `/run/origin/api-origin` mount must contain the 64-character origin credential shared with the future server-side web proxy. Missing or malformed credentials refuse startup. Missing, wrong or combined proof headers reject requests, even when the caller has an account session. Mutation origins must match the canonical HTTPS `WEB_URL`. The only credential-free exception is exact GET/HEAD `/api/health` from the socket's actual loopback address; forwarding headers cannot claim this exception. Responses carry private/no-store, noindex and no-referrer headers.

The local fixture mounts a dedicated private volume at `/data/uploads`, writable only by the non-root API identity. HTTP drivers receive only origin proof and their synthetic session evidence, not database credentials or storage mounts. The API's native file endpoints continue to authorize the organization/project before storage access. The build also fixes upstream LocalStorage's sibling-directory prefix check using path-relative containment and rejects absolute, backslash and NUL keys. A compiled-package test exercises the corrected disk operations.

The full account/HTTP runner uploads a synthetic file, compares exact downloaded bytes, recreates the API container, and verifies persistence and session access. Anonymous, unassigned-project and other-organization requests are denied; removing project membership revokes GET/HEAD/Range and download-URL access. The existing signup/verification flow also passes through ingress. Local volumes are removed after the drill. This does not provision managed object storage, test off-host restore or deploy a Vercel proxy/HTTPS path.

## Managed storage adapter

`STORAGE_PROVIDER=supabase` now selects the compiled REST adapter. See [scoped credentials and live evidence](../storage/README.md). It passes live managed-object operations and access denials using a publishable key plus a dedicated service user; no project administrator key reaches the adapter. The local full API regression still uses its named volume. Full API-to-managed-storage HTTP acceptance and coordinated off-host recovery remain open.

## Live private storage HTTP verification

The same native API account/file suite now passes against the staging Supabase bucket, with a local restricted TLS database and synthetic SMTP capture. It verifies file bytes across container recreation, private ingress, account/project/organization access, membership revocation and exact-object cleanup. See [evidence](managed-storage-evidence.json) and [opt-in command](../storage/README.md#complete-api-with-live-staging-storage). Managed database roles remain disabled; deployment, secret distribution and independent recovery remain open.

## Pooled startup verification

The replacement-project application drill exposed a writable session default on a reused managed connection, even though the startup configuration requested a read-only default. The guard correctly refused startup. Verification now explicitly starts `BEGIN READ ONLY`, performs the same identity/TLS/privilege/schema checks inside that transaction, and rolls it back before disconnecting. Runtime configuration no longer requests a session-wide read-only default, which could affect a later application connection using that backend. The application's Prisma connection remains separate and retains only its existing restricted grants.

The replacement diagnostic attempts a zero-row delete inside the verification transaction and requires PostgreSQL error `25006`; a permissive transaction cannot pass. Synthetic account and file writes then test that ordinary application connections remain usable. See the separate application recovery receipt under `replacement-recovery/` for live acceptance status.

## Delivered secret files

Set `GC_SECRET_MODE=materialized` on the startup wrapper to require `/run/secrets/material/application-secret-env.json`. This file contains only the service's auth/encryption fields; `application-env.json` contains the remaining application settings. Duplicate secret settings refuse startup. The material directory must be mode 0700 and its regular files mode 0400, owned by the application UID (Atrium 1000, Documenso 1001). Symlink files/directories, malformed material, wrong ownership and unknown modes are rejected. Missing material never falls back to inline settings when this mode is selected. Legacy fixtures retain their existing behavior when the mode is absent.

Atrium additionally requires the private material's `api-origin` to match its existing `/run/origin/api-origin` mount. Origin proof is not added to the child environment. The startup wrapper still excludes inherited cloud credentials and performs the restricted TLS/schema guard before launching the application. Production task definitions must select this mode and arrange delivery under the correct application UID; the earlier UID-10001 cloud probe is not that deployment.

Run both actual packages with disposable synthetic material:

```sh
GC_SECRET_MODE=materialized sh portal/deployment/runtime/test/run.sh
GC_SECRET_MODE=materialized RUNTIME_TEST_SERVICE=atrium sh portal/deployment/runtime/test/run.sh
```

These fixtures verify file consumption and ownership using local generated secrets. They do not retrieve live Secrets Manager material, deliver database/Storage credentials, or provision a signing certificate.

`GC_SECRET_MODE=secretsmanager` now performs pinned ECS task-role retrieval inside each application package, then uses the same strict private-file reader. See [delivery configuration and cloud evidence](../runtime-secrets/README.md#application-image-delivery). Cloud probes verify retrieval/consumption/cleanup inside both actual images; full managed application startup remains open.

The local cloud-startup path now also requires the separate connection-secret delivery described in [runtime connections](../runtime-connections/README.md). Live provisioning and bounded Fargate startup now pass using the provisioned connection versions. Both servers pass loopback health; temporary tasks are stopped and database logins disabled afterward. Cloud account/file/signing and public ingress acceptance remain open.

The capture-mail helper supports only `mail` (the default local hostname) or `PORTAL_MAIL_CAPTURE_HOST=127.0.0.1` (a sidecar sharing the isolated ECS task network). Arbitrary hosts and non-synthetic recipients are rejected. The [cloud account/file acceptance](../cloud-account/README.md) now verifies the real managed account and file flow with this sidecar and cloud-delivered secrets.
