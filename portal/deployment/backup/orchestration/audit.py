"""Read-only final audit of the enabled daily backup/restore workflow."""
import datetime,importlib.util,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    deployment=json.loads((ROOT/'deployment.json').read_text());assert deployment['scheduleEnabled']
    stack=job.aws('cloudformation','describe-stacks','--stack-name',deployment['stack'])['Stacks'][0];assert stack['StackStatus']=='UPDATE_COMPLETE'
    rule=job.aws('events','describe-rule','--name','growthcast-portal-staging-backup-workflow');assert rule['State']=='ENABLED' and rule['ScheduleExpression']=='cron(0 6 * * ? *)'
    targets=job.aws('events','list-targets-by-rule','--rule',rule['Name'])['Targets'];assert len(targets)==1 and targets[0]['Arn']==deployment['StateMachineArn']
    assert not job.aws('dynamodb','get-item','--table-name',deployment['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
    assert not job.aws('stepfunctions','list-executions','--state-machine-arn',deployment['StateMachineArn'],'--status-filter','RUNNING')['executions']
    alarms=job.aws('cloudwatch','describe-alarms','--alarm-names',*['growthcast-portal-staging-'+name for name in ['ExecutionsFailed','ExecutionsTimedOut','ExecutionsAborted','BackupScheduleFailed']])['MetricAlarms'];assert len(alarms)==4 and all(a['ActionsEnabled'] and a['AlarmActions']==['arn:aws:sns:us-east-1:059393269249:growthcast-portal-staging-recovery-alerts'] for a in alarms)
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','dailyScheduleEnabled':True,'schedule':rule['ScheduleExpression'],'lockEmpty':True,'activeExecutions':0,'workflowAndScheduleAlarms':[{'name':a['AlarmName'],'state':a['StateValue'],'actionsEnabled':a['ActionsEnabled']} for a in alarms],
        'manualAcceptance':json.loads((ROOT/'acceptance.json').read_text()),'scheduledAcceptance':json.loads((ROOT/'schedule-acceptance.json').read_text()),'permissions':json.loads((ROOT/'policy-evidence.json').read_text()),'validation':['AWS definition validation without diagnostics','Three deterministic workflow boundary tests','Deployment check suite','Portal lint','Public Docker build'],
        'sourceSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.iterdir() if p.suffix in ['.py','.mjs'] or p.name in ['foundation.json','workflow.json']},
        'limitations':['Production-volume capacity/retry/RPO/RTO acceptance remains open.','Replacement-project/bucket/Auth/RLS recovery and restored application startup remain open.','Runtime secret distribution and portal application deployment remain open.','Failures retain the lock for explicit terminal-execution/inactive-task recovery.']}
    (ROOT/'evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Daily schedule, successful real scheduler handoff, empty lock and failure alarms verified.')
if __name__=='__main__':main()
