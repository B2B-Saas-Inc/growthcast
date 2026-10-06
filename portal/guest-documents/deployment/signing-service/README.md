# Persistent staging signing provider

This stack runs the pinned Documenso image in the existing staging VPC and ECS cluster. It uses the existing dedicated provider role, managed database connection, encryption secrets and staging signing certificate. It does not change the portal API task, frontend, production, or document-delivery capability.

The provider listens on port3000 through private service discovery. Its security group accepts traffic only from the staging portal API security group. A public task address provides outbound connectivity; there is no public inbound rule or load-balancer route to the native provider.

`provider-start.mjs` retrieves the pinned certificate with task credentials, writes private ephemeral files, and launches the existing managed runtime wrapper. That wrapper verifies the restricted database role, TLS and schema before starting Documenso. Native SMTP points to an unavailable loopback transport: recipient delivery must use the portal's approved Workspace mailer and provider distribution NONE. Provider stdout is suppressed to avoid logging recipient tokens.

Run from the workspace with existing authenticated AWS and Supabase access:

```sh
python3 -B portal/guest-documents/deployment/signing-service/provider-service.py build
python3 -B portal/guest-documents/deployment/signing-service/provider-service.py template
python3 -B portal/guest-documents/deployment/signing-service/provider-service.py enable-role
python3 -B portal/guest-documents/deployment/signing-service/provider-service.py deploy
python3 -B portal/guest-documents/deployment/signing-service/provider-service.py verify
```

`enable-role` refuses to run if any provider envelopes already exist. It is initial commissioning only, not a routine restart step. Build and create operations use local receipts to avoid accidental repeated creation. If deployment is interrupted, inspect CloudFormation and ECS before resuming; never delete receipts to bypass an uncertain outcome. Deployment failures require reconciliation before further changes. To retire an unsuccessful empty service, drain/delete the stack and confirm all provider tasks stopped before disabling the provider database login. Never disable that role while a valid service is using it.

`verification.json` records ECS health (including database and signing-certificate checks) and the live inbound rule. This is provider infrastructure acceptance only. It does not establish public signing, email delivery, provider API authorization, or completed-document attachment. Those require the gateway, delivery/lifecycle workers, migration013 and full live acceptance before enabling portal sending.

The execution role has one additional inline policy, recorded in `execution-log-policy.json`, limited to creating streams and writing events in this provider's log group. The first task failed before startup because that permission was missing; its replacement started after the scoped grant. Retiring this service also requires removing that specific inline policy after its tasks have stopped.

## Portal API identity

`python3 -B portal/guest-documents/deployment/signing-service/bootstrap.py` commissions the internal signing identity with the pinned provider's Prisma client in a non-root container. Private connection and API material enter through stdin; only identifiers are returned. One transaction creates its organization, team, membership and token using the existing free subscription claim. The stable internal identity and persisted secret make retries reuse the same records; mismatched existing records are refused. Existing historical users/teams are preserved. There is no email, envelope creation or API token in the receipts.

The API secret is version-pinned in `provider-api-pin.json`, encrypted under the existing Documenso KMS key. Runtime consumers have **not** been granted access to it yet. That key currently excludes other runtime identities: provision narrowly scoped delivery/lifecycle access deliberately before wiring the secret, preserving denials for backup and unrelated roles. `provider-identity.json` and `identity-verification.json` confirm successful repeated commissioning and zero envelopes. Live HTTP API authentication still needs verification from the portal service network.
