"""Exercise the actual EventBridge invocation once, then restore the hourly rate."""
import datetime
import importlib.util
import json
from pathlib import Path
import time
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)

def main():
    rule_name='growthcast-portal-staging-recovery-monitor'
    rule=job.aws('events','describe-rule','--name',rule_name)
    assert rule['State']=='ENABLED' and rule['ScheduleExpression']=='rate(1 hour)'
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0];out={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    def tasks():
        found=set()
        for status in ['RUNNING','STOPPED']:
            found.update(job.aws('ecs','list-tasks','--cluster',out['ClusterArn'],'--family','growthcast-portal-staging-backup-monitor','--desired-status',status)['taskArns'])
        return found
    previous=tasks();arn=None
    try:
        job.aws('events','put-rule','--name',rule_name,'--schedule-expression','rate(1 minute)','--state','ENABLED','--description',rule['Description'])
        for _ in range(36):
            new=tasks()-previous
            if new:arn=sorted(new)[0];break
            time.sleep(5)
        assert arn,'No scheduled monitor task observed'
    finally:
        job.aws('events','put-rule','--name',rule_name,'--schedule-expression',rule['ScheduleExpression'],'--state',rule['State'],'--description',rule['Description'])
    for _ in range(90):
        task=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',arn)['tasks'][0]
        if task['lastStatus']=='STOPPED':break
        time.sleep(5)
    else:
        job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',arn,'--reason','Scheduled monitor acceptance deadline');raise RuntimeError('Scheduled task timeout')
    assert task['taskDefinitionArn']==out['MonitorTaskDefinitionArn'] and task['containers'][0].get('exitCode')==0
    logs=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','monitor/monitor/'+arn.split('/')[-1],'--start-from-head')['events']
    states=[]
    for event in logs:
        try:value=json.loads(event['message'])
        except ValueError:continue
        if isinstance(value,dict) and value.get('stage')=='MONITORED':states.append(value)
    assert len(states)==1 and states[0]['healthy'] is True
    restored=job.aws('events','describe-rule','--name',rule_name);assert restored['ScheduleExpression']=='rate(1 hour)'
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'taskArn':arn,'startedBy':task.get('startedBy'),'exitCode':0,'state':states[0],'temporaryOneMinuteAcceptance':True,'restoredSchedule':'rate(1 hour)','backupScheduleEnabled':False}
    (ROOT/'schedule-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Actual scheduled monitor invocation passed; rule restored to hourly. Backup scheduling remains disabled.')

if __name__=='__main__':main()
