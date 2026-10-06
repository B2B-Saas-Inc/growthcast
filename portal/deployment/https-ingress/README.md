# Staging API HTTPS prerequisite

`certificate.py` requests a non-exportable ACM public certificate for exactly `api.clients.staging.growthcast.app` in account `059393269249`, region `us-east-1`. It saves the ARN immediately, resumes that same request on subsequent runs, and refuses an untracked existing certificate. It does not retrieve secrets, change DNS, deploy a listener or enable database logins.

`certificate.json` records the current live status: **ISSUED**. The validation record in `cloudflare-validation.txt` has been added through the Cloudflare MCP in the **growthcast.app** zone: CNAME, DNS only, TTL Auto, CNAME flattening disabled. API read-back and an authoritative DNS query verified the exact target; `dns-evidence.json` records the account, zone and record IDs. Leave the record in place for renewal. This certificate is for HTTPS transport, not PDF signing.

DNS discovery found Cloudflare nameservers `grannbo.ns.cloudflare.com` and `cesar.ns.cloudflare.com`. Vercel reports external DNS and no hosted records. The staging Vercel project has only its default `growthcast-clients-staging.vercel.app` domain. The newly available Cloudflare MCP successfully accessed the B2B SaaS Inc. account and created the single previously absent validation record. DNS access is no longer blocked.

To refresh certificate status:

```sh
python3 -B portal/deployment/https-ingress/certificate.py
```

The issued certificate is now attached to the staging HTTPS listener described below. The certificate receipt alone is not runtime acceptance: see the separate service audit and web-proxy evidence. Phase 2 remains open.

Reference: [ACM DNS validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html). AWS requires successful DNS validation within 72 hours; an expired request requires reconciliation and a replacement request, not silently reusing the stale receipt.

## Deployed service

The add-only `growthcast-portal-staging-api` CloudFormation stack is deployed. It owns a dedicated VPC, two public subnets in the reviewed us-east-1a/us-east-1b zones, an HTTPS-only ALB with the issued certificate, a dedicated ECS cluster and one ARM64 0.5-vCPU/1-GiB task. This is persistent staging compute and load-balancer infrastructure. Supabase remains the database; no RDS or NAT gateway was created.

The API container uses the previously verified immutable image, UID 1000, readonly root, dropped capabilities and private writable volumes. Its existing task role retrieves exact-version auth/proof and connection material; no secrets appear in task configuration or template. Only `gc_app` is enabled; all five other application/migration roles remain NOLOGIN. A capture-mail sidecar accepts only synthetic recipients through the existing helper and has no externally admitted port. Application stdout/stderr is suppressed to prevent auth-link/cookie leakage; the supervisor emits only bounded exit status. Additional operational application monitoring remains open.

Task port 3001 admits traffic only from the load-balancer security group. Internet clients can reach the ALB on 443 only. The listener requires the API hostname and `/api/*`, otherwise returns 404. The application enforces its private origin proof and same-origin mutations. ALB health probes expect the deliberate unauthenticated 403; independent ECS health probes require loopback application health 200. This avoids creating a public health bypass. A task has a public IP for outbound ECR/Secrets Manager/Supabase access but no direct public ingress rule. Egress is limited to HTTPS and PostgreSQL TLS ports.

`audit-evidence.json` independently verifies the listener/certificate, task health, target health, exact runtime image/role/command, ingress restriction and all six database role flags. `routing-evidence.json` records the newly created Cloudflare API/frontend DNS-only CNAMEs and successful HTTPS verification. The certificate status inspector only reads ACM once a request receipt exists; it never modifies DNS.

`replacement.py` requests a fresh task, requires the old task to stop and the new task to be healthy, and records its bounded scope. Follow with `web-proxy/verify.py` to verify the replaced service through HTTPS. This does not establish existing-account/session/file persistence across task replacement; that still requires an authenticated fixture flow.

The staging frontend domain now points to the protected Atrium frontend in `../web-app/`. Its existing-account browser/file acceptance passes; browser invitation/email verification, authenticated persistence across task replacement, managed signing, signing certificate/recovery, live-secret rotation/recovery and remaining Phase 2 checks are still open.
