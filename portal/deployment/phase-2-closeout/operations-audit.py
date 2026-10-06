"""Read-only staging recovery measurements and configured bounds; no production SLO claim."""
import json,datetime
from pathlib import Path
from aws import aws
R=Path(__file__).resolve().parent
receipt=json.loads((R.parent/'revenue-report/recovery-acceptance.json').read_text());e=aws('stepfunctions','describe-execution','--execution-arn',receipt['executionArn']);assert e['status']=='SUCCEEDED'
start=datetime.datetime.fromisoformat(e['startDate']);stop=datetime.datetime.fromisoformat(e['stopDate']);elapsed=(stop-start).total_seconds()
outputs=json.loads(e['output']);assert outputs['status']=='VERIFIED'
rule=aws('events','describe-rule','--name','growthcast-portal-staging-backup-workflow');assert rule['State']=='ENABLED' and rule['ScheduleExpression']=='cron(0 6 * * ? *)'
lock=aws('dynamodb','get-item','--table-name','growthcast-portal-staging-backup-lock','--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read');assert not lock.get('Item')
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'current staging workload only','fullBackupAndIndependentRestoreSeconds':elapsed,'workflowVerified':True,'workflowExecution':receipt['executionArn'],'backupSchedule':rule['ScheduleExpression'],'configuredBackupIntervalHours':24,'freshnessAlarmThresholdHours':30,'archiveLimitMiB':256,'perStageTimeoutMinutes':30,'workflowTimeoutMinutes':65,'lockReleased':True,'productionRpoRtoAccepted':False,'productionVolumeCapacityAccepted':False,'productionGate':'Phase 7: approve and prove proposed 1-hour RPO / 4-hour RTO, capacity and recovery availability; current daily staging backups do not meet a 1-hour RPO.'}
(R/'operations-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Current staging backup/restore measured at '+str(round(elapsed,1))+' seconds; daily schedule and released lock verified.')
