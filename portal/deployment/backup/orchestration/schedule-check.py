"""Exercise the real EventBridge workflow target once, then return to disabled daily cron."""
import datetime,importlib.util,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('check',ROOT/'check.py');check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check);job=check.job
RULE='growthcast-portal-staging-backup-workflow'
def main():
    assert not (ROOT/'schedule-acceptance.json').exists(),'Existing scheduled acceptance must not repeat silently'
    assert json.loads((ROOT/'acceptance.json').read_text())['status']=='SUCCEEDED'
    deployment=json.loads((ROOT/'deployment.json').read_text());rule=job.aws('events','describe-rule','--name',RULE);assert rule['State']=='DISABLED' and rule['ScheduleExpression']=='cron(0 6 * * ? *)'
    existing={e['executionArn'] for e in job.aws('stepfunctions','list-executions','--state-machine-arn',deployment['StateMachineArn'])['executions']}
    started=datetime.datetime.now(datetime.timezone.utc)
    arn=None
    try:
        job.aws('events','put-rule','--name',RULE,'--schedule-expression','rate(1 minute)','--state','ENABLED')
        for _ in range(60):
            new=[e for e in job.aws('stepfunctions','list-executions','--state-machine-arn',deployment['StateMachineArn'])['executions'] if e['executionArn'] not in existing]
            if new:
                assert len(new)==1;arn=new[0]['executionArn'];break
            time.sleep(5)
        else:raise RuntimeError('Scheduled workflow did not start')
    finally:
        job.aws('events','put-rule','--name',RULE,'--schedule-expression','cron(0 6 * * ? *)','--state','DISABLED')
    print('EventBridge started the workflow; temporary minute schedule removed.',flush=True)
    record=check.inspect_execution(arn,deployment);record.update(invocation='EventBridge scheduled target',temporaryMinuteScheduleRestored=True)
    for _ in range(30):
        metrics=job.aws('cloudwatch','get-metric-statistics','--namespace','AWS/Events','--metric-name','SuccessfulInvocationAttempts','--dimensions','Name=RuleName,Value='+RULE,'--start-time',started.isoformat(),'--end-time',datetime.datetime.now(datetime.timezone.utc).isoformat(),'--period','60','--statistics','Sum')['Datapoints']
        if sum(x['Sum'] for x in metrics)>=1:break
        time.sleep(10)
    else:raise RuntimeError('No scheduler target success metric observed')
    record['successfulSchedulerInvocations']=metrics;(ROOT/'schedule-acceptance.json').write_text(json.dumps(record,indent=2)+'\n');print('Actual scheduled backup-to-restore execution succeeded; daily cron remains disabled for final enablement.')
if __name__=='__main__':main()
