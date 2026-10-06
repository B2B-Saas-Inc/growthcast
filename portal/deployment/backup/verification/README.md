# Independent verification and recovery monitoring

Successful independent restores now publish append-only records under `verification/staging/` in the existing encrypted/versioned archive bucket. The restore role can create and read these records; neither the operator archive uploader nor the ECS backup task can write them. The monitor can list/read only this prefix and emit bounded recovery metrics. It cannot fetch archive bytes, retrieve source secrets, decrypt keys, or write verification records. Thirty-day current/noncurrent record retention matches the archive retention period; this is not Object Lock or a legal hold.

`job/restore-check.py` publishes a VERIFIED record only after exact-version S3/KMS recovery, authenticated decryption, data/ownership/ACL/schema/access checks, object binding and overwrite refusal pass. Records bind the archive and upload-receipt versions, SHA-256, key-envelope pointer, source run and evidence digest. A later failed validation/publication attempt writes a FAILED record when a validated upload receipt is available. Failures before that point still surface through the operator command and eventual freshness/heartbeat monitoring; automated restore orchestration remains open.

Freshness uses the backup run's starting timestamp, not the time the archive was restored. Re-verifying an old archive cannot make old data fresh. Missing, invalid or future-dated records fail closed. A newer restore failure remains unhealthy until a subsequent successful verification of that or newer source data. Upload success does not resolve restore failure.

## Deployed monitor

The separate digest-pinned ECS image contains only the monitor and its pinned SDK dependencies. It runs as UID 10001 with a read-only filesystem, no mounts, no source credentials and HTTPS-only egress. Its distinct role has verification-prefix read/list and metric permissions. It evaluates up to 1,000 records of at most 64 KiB each and fails unhealthy if this bound is exceeded or reads/validation fail.

EventBridge runs the monitor hourly using a role restricted to that task definition, cluster and the two required pass-role identities. Both a manual task and an actual scheduled invocation passed. Acceptance temporarily used a one-minute rate to exercise the real EventBridge role, then restored the hourly rate in a `finally` block. `schedule-evidence.json` records `startedBy: events-rule/growthcast-portal-staging-recovery-monitor`, a zero exit and healthy evaluation.

CloudWatch receives `RecoveryHealthy`, `RecoveryMonitorHeartbeat` and `VerifiedBackupAgeHours`. Recovery health fails when the newest verified source backup is over 30 hours old, a relevant restore failure is unresolved, or records cannot be trusted. Missing monitor heartbeats breach after two hourly periods. The 30-hour freshness threshold supports the proposed daily staging backup interval; it does not accept the original production RPO/RTO targets.

## Notifications and startup failures

The dedicated SNS subscription targets **ewhite@growthcast.app**, explicitly selected by the operator. AWS requires its email-confirmation link to be clicked before delivery. The subscription is now confirmed and notification routes are enabled. CloudWatch health/heartbeat alarms and an independent ECS stopped-task rule are provisioned; the latter matches nonzero exits and `TaskFailedToStart`, while excluding successful exits. AWS `test-event-pattern` validates all three cases. The stopped-task route catches failures that occur before the backup can emit a metric. Alarm/event messages contain only operational metadata.

Activation and one-time delivery-test commands (already executed):

```sh
# Ensure the live monitor acceptance is recent, then enable the reviewed routes.
python3 -B portal/deployment/backup/verification/cloud-check.py
python3 -B portal/deployment/backup/verification/provision.py --enable-notifications
python3 -B portal/deployment/backup/verification/notification-check.py
```

The last command sends one clearly labeled SNS delivery test and refuses silent repetition. SNS publish acceptance is distinct from the operator confirming arrival in the inbox. One labeled delivery test was accepted by SNS; the operator confirmed inbox receipt. See `notification-evidence.json` and `final-audit.json`.

## Verification and remaining work

Six deterministic freshness cases, twelve live IAM simulations, actual uploader-write/overwrite denials, exact-version record read-back, the repeated full restore, and deployed/scheduled monitor checks pass. `policy-check.py` also tests real AWS event-pattern matching. `evidence.json` links receipts and scope.

Daily staging backup and independent restore verification are now enabled at 06:00 UTC; the separate monitor runs hourly. Production-capacity/retry/RPO/RTO acceptance, replacement-project recovery and staging portal deployment remain open. The freshness alarm becomes unhealthy if no newer verified backup is produced.

## Actual failure-route acceptance

An intentional ECS task exit now passes the actual deployed stopped-task alert route: EventBridge reports successful SNS target delivery. The test used the pinned backup image with no task role or source credentials, performed no capture, and its temporary revision was deregistered. The earlier SNS test has operator-confirmed inbox receipt; receipt of this specific failure alert remains unconfirmed. See `failure-route-evidence.json`. Automatic backups remain unscheduled; unattended independent verification is the next scheduling dependency.

`python3 -B portal/deployment/backup/verification/failure-route-check.py` reproduces the bounded drill and refuses to repeat an existing recorded run. It intentionally sends an operational failure alert through the existing rule.

The [independent ECS restore worker](../restore-worker/README.md) now passes autonomous archive retrieval, decryption, restore and verification publication for an exact receipt pointer. The monitor accepts its record. The daily workflow now supplies exact receipt pointers automatically; see [orchestration](../orchestration/README.md).
