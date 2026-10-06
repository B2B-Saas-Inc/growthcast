# Backup and independent restore orchestration

The Standard Step Functions workflow acquires an exclusive DynamoDB lock, runs the pinned backup task to completion, reads that task's bounded upload status and passes its exact receipt key/version to the separate pinned verifier. Success requires a zero verifier exit after durable verification publication; upload alone cannot finish the workflow. The verifier validates the receipt, archive versions, KMS context, hashes, database/object contents and permissions. Both images and task-definition revisions are pinned.

The workflow uses native ECS `.sync`, DynamoDB and CloudWatch Logs integrations. It retrieves no source secret or archive bytes and cannot publish a verification record. Its role can run only the two reviewed task revisions in the staging cluster, pass only their required identities, read backup status logs and conditionally acquire/release the dedicated lock. The scheduling role can start only this workflow.

The daily rule is now enabled after manual and real scheduler acceptance. It remains disabled by default in new deployments. Its expression is `cron(0 6 * * ? *)`, meaning 06:00 UTC. Every backup gets a full independent restore, so the 30-hour verification freshness monitor can detect a missed daily run. A 24-hour backup interval is not production RPO acceptance. The workflow limit is 65 minutes; each ECS stage is bounded at 30 minutes, with shorter application deadlines. ECS task launches are not retried automatically to avoid duplicate captures; SDK operations already have bounded retries. Production-volume capacity and retry availability remain open.

## Acceptance and enablement

```sh
python3 -B portal/deployment/backup/orchestration/generate.py
python3 -B portal/deployment/backup/orchestration/deploy.py
python3 -B portal/deployment/backup/orchestration/check.py
python3 -B portal/deployment/backup/orchestration/schedule-check.py
python3 -B portal/deployment/backup/orchestration/deploy.py --enable
```

The first acceptance captures fresh staging data and tests competing lock acquisition and wrong-owner release denial. The schedule test temporarily enables a one-minute rule, observes its actual workflow invocation, and restores the disabled daily cron before waiting for completion. The enablement change set may modify only the schedule state and requires recent successful acceptance. See the deployment and acceptance JSON files for actual status.

A malformed or incomplete upload log fails closed. Log reads have bounded eventual-consistency waits; the pinned backup emits exactly three status lines. Changes to that format require reviewing the workflow. Execution history contains only task metadata and bounded status records, not database contents or credentials.

## Failure recovery

Any failure after lock acquisition retains the lock. No TTL silently frees a possibly active task. Failed, timed-out and aborted workflows, plus scheduler target failures, have SNS alarm routes. Existing task-stop alerts and the independent hourly freshness/heartbeat monitor remain enabled.

Inspect the failed execution and its bounded ECS logs. Resolve the cause before re-enabling progress. Stop any orphaned backup/verifier task and verify its termination; `.sync` cancellation is best effort. The recovery command refuses active executions, any active backup/verifier task, or a lock owned by another execution:

```sh
python3 -B portal/deployment/backup/orchestration/release-failed-lock.py --execution-arn EXACT_FAILED_EXECUTION_ARN
```

Then start a fresh workflow and require successful independent verification. To pause daily invocations, disable `growthcast-portal-staging-backup-workflow` in EventBridge; this does not stop an already-running workflow. Keep hourly monitoring active. Replacement-project application recovery, production-scale acceptance and the portal application deployment remain separate gates.

AWS integration references: [ECS synchronous tasks](https://docs.aws.amazon.com/step-functions/latest/dg/connect-ecs.html), [SDK integrations](https://docs.aws.amazon.com/step-functions/latest/dg/supported-services-awssdk.html).

Replacement managed PostgreSQL, bucket and service-identity recovery now passes; see `portal/deployment/replacement-recovery/evidence.json`. The disposable target and archive volumes were removed. Restored application startup and production-scale recovery acceptance remain open.
