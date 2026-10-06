# Private web-proxy proof handoff

The protected Vercel staging project `growthcast-clients-staging` now contains only the API origin proof as `PORTAL_API_ORIGIN_PROOF`, with type `sensitive` and target `preview`. `transfer.py` copies that one field from the exact existing Atrium Secrets Manager version. It does not transfer the Better Auth secret, database connection, Storage credentials or signing material. The transferred origin proof is never written to local files, evidence or logs.

The source AWS secret remains the recovery source for the proof. This operation does not rotate it. The transfer refuses an existing variable or receipt, checks project/team identity and protection before writing, and audits that exactly one variable was added. `audit.py` independently verifies the sensitive preview scope, current source version, unchanged all-deployment protection and absence of application credential variables. The previously expired Vercel CLI access token was refreshed through the normal CLI flow using its saved refresh credential; no new user login was needed.

`runtime.mjs` adapts the existing API proxy to server-side runtime configuration:

- `PORTAL_WEB_URL`: canonical HTTPS frontend origin.
- `PORTAL_API_URL`: its exact `api.` counterpart.
- `PORTAL_API_ORIGIN_PROOF`: the private service proof.

It must run in the server request handler, not in client code or at build time. Only the proof variable has been provisioned; backend URL configuration and deployment remain open. Local checks verify forged-proof replacement, filtering of bearer/cloud/forwarding headers, preservation of host-only session cookies, private/noindex response headers, origin enforcement, missing/public proof rejection and generic upstream failures without proof disclosure.

```sh
# Already executed; the transfer deliberately refuses implicit overwrite.
python3 -B portal/deployment/proxy-secret/transfer.py
python3 -B portal/deployment/proxy-secret/audit.py
sh portal/deployment/check.sh
```

`evidence.json` records API-write and metadata verification only. `runtimeConsumptionVerified` remains false: no Vercel application/function was deployed or exercised as part of this handoff. There is no new DNS route or backend listener. The live proxy/HTTPS request, browser flows, managed signing, operational secret rotation/recovery and remaining deployment acceptance are still required.

The [Vercel sensitive-variable documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables) and [environment creation API](https://vercel.com/docs/rest-api/sdk/projects/create-one-or-more-environment-variables) were checked before using `type: sensitive`, `target: [preview]` and create-only semantics. The pinned CLI tooling image installs dependencies before mounting authentication state.

Subsequent HTTPS deployment has now verified runtime consumption of this exact preview proof: see `../web-proxy/evidence.json` and `../web-proxy/audit-evidence.json`. The original handoff receipts above intentionally retain their point-in-time `runtimeConsumptionVerified: false`. The current deployment is a protected proxy verification page, with full frontend/browser acceptance still open.
