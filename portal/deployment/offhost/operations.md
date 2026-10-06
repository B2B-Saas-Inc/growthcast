# Staging backup operation contract

Managed archive-key wrapping is implemented separately from unattended backup execution. The existing `managed-recovery/run.sh` is a destructive-target **test drill**: it requires closed staging and an empty source bucket, writes one synthetic object, and provisions disposable local targets. Do not attach it to a recurring production schedule.

## Schedule and success criteria

- Enabled daily staging capture at 06:00 UTC, followed by independent database/object restoration. Each ECS stage has a 30-minute workflow timeout; the whole workflow is bounded at 65 minutes. An exclusive lock prevents overlapping workflow runs.
- Every captured archive is restored into a fresh target, including both schema guards, privilege denials and row/object integrity. Replacement-project recovery and restored application startup remain open.
- Proposed backup interval: 24 hours. This is not an accepted RPO; restore time remains unmeasured for production volumes.
- Mark a backup usable only after its archive and KMS envelope versions are durably recorded and an independent read verifies archive SHA-256, context-bound key recovery and authenticated decryption.
- Retain the existing staging archive lifecycle. Do not delete or disable a KMS key while any retained archive depends on it. Annual KMS rotation keeps prior key material usable for old ciphertext; it does not rewrite archives or replace per-archive data keys.

## Failure and freshness reporting

The job emits only run ID, environment, stage, timestamps, byte/object counts, duration and bounded failure category. Stages are `STARTED`, `CAPTURED`, `UPLOADED`, `VERIFIED`, `FAILED`. Never log database URLs, authorization headers, storage passwords, encryption keys, document contents or recipient identifiers. An `UPLOADED` receipt is not a successful restore verification.

Record a failed-run metric immediately. Independently check the latest verified receipt hourly and report stale backup state after 30 hours; absence of any verified receipt is failure. Job failure and stale state must be visible even if the capture process cannot start. A successful upload must not clear a restore-validation failure. The operator selected and confirmed `ewhite@growthcast.app`. Health/heartbeat alarm actions and the stopped-task notification route are enabled. SNS accepted one labeled delivery test; the operator confirmed inbox receipt. The separate restricted monitor is now deployed hourly and has passed an actual scheduled invocation. See [verification/monitoring](../backup/verification/README.md).

## Implementation history and remaining production gates

1. The separate [all-object capture](../backup/CAPTURE.md) now uses one exported database snapshot and aborts on object-inventory changes, with reference/byte binding checks. It supports concurrent database writes and fails closed during conflicting file changes. Production-volume capacity, retry behavior and availability under file churn still need operational acceptance. The original closed-staging drill must not be scheduled.
2. The dedicated read-only database identity and managed source secret are provisioned and a full operator restore passes with that identity. Read-only object credentials are also provisioned, stored in the same managed secret, and used by the isolated capture. The digest-pinned [ECS job](../backup/job/README.md) has one-off execution and independent local restore evidence. See [backup foundation](../backup/README.md).
3. An ECS-only backup task role is provisioned and twelve IAM policy simulations pass. Task credential/secret delivery and the separate image/log execution role now pass live one-off ECS acceptance. The backup uses ECS credentials; independent operator restore drills still use temporary STS bootstrap. Scheduler wiring and exact-receipt handoff now pass real EventBridge acceptance.
4. Versioned upload receipts and upload/failure metric code now exist, with successful metric emission in the live task. Durable independent verification receipts and hourly read-only freshness monitoring now pass live acceptance. Daily scheduling and automated independent restore now pass; the deployed failure route also passed its intentional failure test. The operator confirmed receipt of the labeled SNS test.
5. A replacement-project/bucket/Auth/RLS restore runbook and application restart evidence, including access revocation after restoration.

Backup scheduler status: **enabled at 06:00 UTC daily**, with independent restore after each capture. The independent monitor runs hourly. This document makes the remaining work concrete; current scheduling and alert evidence is recorded under `backup/orchestration/`.

The independent ECS verifier now completes archive download, KMS recovery, restore checks and verification publication without host-side recovery. It requires an exact receipt pointer. The enabled stopped-task rule also covers its startup/nonzero failures. Automatic receipt handoff and daily orchestration now pass manual and actual scheduler acceptance; see [restore worker](../backup/restore-worker/README.md).

Replacement managed PostgreSQL, bucket and service-identity recovery now passes; see `portal/deployment/replacement-recovery/evidence.json`. The disposable target and archive volumes were removed. Restored application startup and production-scale recovery acceptance remain open.
