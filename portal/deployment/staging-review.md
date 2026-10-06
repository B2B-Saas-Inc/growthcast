# Superseded — do not execute

The operator selected existing Supabase instead of RDS. The unexecuted AWS change set was deleted on 2026-09-23; the historical template is archived under `superseded/aws-foundation-rds.json`. The estimate below is withdrawn, not an approved budget or a quote for the revised architecture. No billable AWS foundation resources were created.

# Staging foundation review — 2026-09-23

Access is verified: Vercel team `b2b-saas` owns `growthcast.app`; AWS account `059393269249` is accessible in `us-east-1`. The MCP Vercel team listing remains empty, but direct API access through the refreshed local Vercel login works. No credential values were printed.

Created Vercel project `growthcast-clients-staging` (`prj_CMSykF9Wbj5YNwQAgl1lANn5tX3w`) with Vercel authentication protection for all deployments. No application deployment, DNS attachment or agency-project change was made.

Prepared CloudFormation change set `phase2-foundation-v1` on stack `growthcast-portal-staging`: **CREATE_COMPLETE / AVAILABLE**, with **80 Add operations**, no modifications or removals. It is **not executed**. The exact template hash and change-set ARN are recorded in `staging-change-set.json`. PostgreSQL 17.11 was verified as currently available and AWS accepted the template. No billable foundation resources or application tasks have been created.

## Estimated foundation cost

Prices retrieved from the AWS Price List API on 2026-09-23 for US East (N. Virginia), using 730 hours/month:

| Resource | Rate | Estimated monthly cost |
| --- | --- | ---: |
| Single-AZ RDS db.t4g.small | $0.032/hour | $23.36 |
| One zonal NAT gateway | $0.045/hour | $32.85 |
| One public IPv4 address | $0.005/hour | $3.65 |
| 30 GB RDS gp3 storage | $0.115/GB-month | $3.45 |
| 12 generated/empty secret resources plus RDS master secret | $0.40/secret-month | $5.20 |
| One customer-managed KMS key | $1/key-month | $1.00 |
| **Estimated fixed foundation subtotal** | | **$69.51** |

Usage is additional: NAT data processing $0.045/GB, Secrets Manager calls $0.05/10,000 and standard KMS requests $0.03/10,000, plus S3/ECR storage, logs, transfer and excess backup storage. Taxes, Vercel plan charges, application containers, load balancer, email, signing identity and production infrastructure are excluded. This is an estimate, not a bill cap. Retained data resources and deletion protection require deliberate teardown; stopping application containers alone does not stop these foundation charges.

## Execution boundary

The Desktop implementation plan's section 4 cost gate explicitly says its $100–$250/month allowance “is not a verified quote or spending authorization.” Request acceptance of this concrete foundation cost before executing the prepared change set. This approval would cover the staging foundation only. Production packaging, runtime task definitions, private provider/egress controls, managed-key recovery and deployed acceptance remain engineering work.

After authorization, recheck the template hash, target account and change-set contents before execution; then wait for stack completion, inspect outputs without reading secret values, provision reviewed database roles/migrations, and continue runtime packaging. Do not attach the production client domain or route traffic to fixture applications.
