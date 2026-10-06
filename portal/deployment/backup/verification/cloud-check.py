"""Run and audit the deployed read-only freshness monitor once."""
import datetime
import importlib.util
import json
from pathlib import Path
import tempfile
import time
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)

def main():
    deployment=json.loads((ROOT/'monitor-deployment.json').read_text())
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0]
    assert stack['StackStatus']=='UPDATE_COMPLETE';out={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    definition=job.aws('ecs','describe-task-definition','--task-definition',out['MonitorTaskDefinitionArn'])['taskDefinition'];container=definition['containerDefinitions'][0]
    assert container['image']==deployment['image'] and container['readonlyRootFilesystem'] and container['user']=='10001:10001'
    assert not container.get('mountPoints') and not container.get('environment') and not container.get('portMappings')
    assert definition['taskRoleArn']=='arn:aws:iam::059393269249:role/growthcast-portal-staging-recovery-monitor'
    rule=job.aws('events','describe-rule','--name','growthcast-portal-staging-recovery-monitor');assert rule['State']=='ENABLED' and rule['ScheduleExpression']=='rate(1 hour)'
    targets=job.aws('events','list-targets-by-rule','--rule',rule['Name'])['Targets'];assert len(targets)==1 and targets[0]['EcsParameters']['TaskDefinitionArn']==out['MonitorTaskDefinitionArn']
    request={'cluster':out['ClusterArn'],'taskDefinition':out['MonitorTaskDefinitionArn'],'launchType':'FARGATE','platformVersion':'1.4.0','count':1,
        'networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['MonitorSecurityGroupId']],'assignPublicIp':'ENABLED'}}}
    with tempfile.TemporaryDirectory(prefix='growthcast-monitor-check-') as directory:
        (Path(directory)/'request.json').write_text(json.dumps(request));result=job.aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=directory)
    assert not result.get('failures') and len(result['tasks'])==1;arn=result['tasks'][0]['taskArn']
    for _ in range(90):
        task=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',arn)['tasks'][0]
        if task['lastStatus']=='STOPPED':break
        time.sleep(5)
    else:
        job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',arn,'--reason','Monitor acceptance timeout');raise RuntimeError('Monitor timed out')
    assert task['containers'][0].get('exitCode')==0,'Monitor failed; inspect bounded status logs'
    logs=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','monitor/monitor/'+arn.split('/')[-1],'--start-from-head')['events']
    states=[]
    for event in logs:
        try:state=json.loads(event['message'])
        except ValueError:continue
        if isinstance(state,dict) and state.get('stage')=='MONITORED':states.append(state)
    assert len(states)==1 and states[0]['healthy'] is True
    backup_scheduled=False
    if (ROOT.parent/'orchestration/deployment.json').exists():
        backup_scheduled=job.aws('events','describe-rule','--name','growthcast-portal-staging-backup-workflow')['State']=='ENABLED'
    evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'taskArn':arn,'image':deployment['image'],'exitCode':0,'state':states[0],'monitorScheduleEnabled':True,'monitorSchedule':'rate(1 hour)','backupScheduleEnabled':backup_scheduled,'readOnlyRoot':True,'sourceSecretsMounted':False}
    (ROOT/'cloud-monitor-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print('Deployed restricted monitor evaluated durable verification evidence and emitted healthy status; hourly monitor enabled; backup schedule unchanged.')

if __name__=='__main__':main()
