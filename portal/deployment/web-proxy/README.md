# Protected staging web proxy

This initial verification-page deployment is now superseded on the canonical staging domain by `../web-app/`. Its proxy factory remains in use. The deployment and audit receipts here describe the earlier milestone; use the web-app receipts for the current alias.

The existing `growthcast-clients-staging` Vercel project now serves a preview deployment at **https://clients.staging.growthcast.app** with all-deployment Vercel Authentication retained. This package contains the real server API proxy and a staging verification page, **not the full Atrium frontend**. Full browser account/file flows and frontend integration remain open.

The Node `/api/[...path]` route reads the sensitive preview-only proof at request time and uses the previously tested proxy factory. Only the two canonical non-secret origins were added to preview variables. Application auth, encryption, database and Storage credentials remain outside Vercel. The allowlisted upload includes only app/lib sources, configuration and locked package manifests. `deploy.py` checks that the copied runtime and proxy sources match their originals before upload. Dependencies and CLI tooling are installed in containers.

`evidence.json` records real HTTPS checks through authenticated `vercel curl`, which handles deployment-protection bypass privately. Anonymous frontend requests redirect to Vercel Authentication; direct API requests with absent/forged proofs return 403; the protected proxy returns health 200 even with a forged client proof (which is overwritten); anonymous private-file access returns 401; missing/cross-origin mutations return 403. This proves the deployed function consumes the configured proof. It does not prove authenticated browser cookies, invitations, accounts, uploads or signing.

`deployment.json` identifies the active preview and alias. `source-evidence.json` hashes the deployed package. Vercel automatically classified the first deployment to the empty project as production despite omission of `--prod`; it had no preview variables and failed closed for API requests. Subsequent deployments explicitly select `--target preview`. That initial deployment and the superseded first preview were deleted after the final preview was ready and aliased; their metadata receipts are retained. No Growthcast production project/domain was deployed or changed.

```sh
python3 -B portal/deployment/web-proxy/verify.py
python3 -B portal/deployment/https-ingress/audit.py
```

Deployment steps are intentionally explicit: configure origins/domain, deploy the allowlisted package, wait for READY, then run `alias.py` and verification. Do not promote this staging verification page to the production portal. Keep the canonical domain because the proxy rejects arbitrary preview origins.
