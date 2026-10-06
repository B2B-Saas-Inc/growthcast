"""Publish digest-pinned hourly monitor; the backup task and its schedule are unchanged."""
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)

def main():
    assert job.aws('sts','get-caller-identity')['Account']=='059393269249'
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0]
    assert stack['StackStatus']=='UPDATE_COMPLETE'
    out={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    assert 'MonitorTaskDefinitionArn' not in out,'Existing monitor revision needs explicit review'
    previous=job.aws('cloudformation','get-template','--stack-name',job.STACK)['TemplateBody']
    if isinstance(previous,str):previous=json.loads(previous)
    template=json.loads((ROOT.parent/'job/foundation.json').read_text())
    assert previous['Resources']['Task']==template['Resources']['Task'],'Backup task must not change'
    repo=out['RepositoryUri'];assert repo=='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'
    tag='monitor-'+str(uuid.uuid4())
    context=json.loads(subprocess.run(['docker','context','inspect'],capture_output=True,text=True,check=True).stdout)[0]
    with tempfile.TemporaryDirectory(prefix='growthcast-monitor-registry-') as directory:
        env=os.environ.copy();env.pop('DOCKER_CONTEXT',None);env['DOCKER_CONFIG']=directory;env['DOCKER_HOST']=context['Endpoints']['docker']['Host']
        auth=job.command(['ecr','get-login-password'])
        assert subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=auth,env=env,capture_output=True).returncode==0
        for args in [['tag','growthcast-recovery-monitor',repo+':'+tag],['push',repo+':'+tag]]:assert subprocess.run(['docker',*args],env=env,capture_output=True).returncode==0
    digest=job.aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
    change='monitor-'+str(uuid.uuid4())
    request={'StackName':job.STACK,'ChangeSetName':change,'ChangeSetType':'UPDATE','Capabilities':['CAPABILITY_NAMED_IAM'],'TemplateBody':json.dumps(template),
        'Parameters':[{'ParameterKey':'AvailabilityZone','UsePreviousValue':True},{'ParameterKey':'ImageDigest','UsePreviousValue':True},{'ParameterKey':'MonitorImageDigest','ParameterValue':digest}]}
    with tempfile.TemporaryDirectory(prefix='growthcast-monitor-plan-') as directory:
        (Path(directory)/'request.json').write_text(json.dumps(request));job.aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=directory)
    for _ in range(60):
        plan=job.aws('cloudformation','describe-change-set','--stack-name',job.STACK,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        if plan['Status']=='FAILED':raise RuntimeError('Monitor plan failed')
        time.sleep(3)
    else:raise RuntimeError('Monitor plan timeout')
    changes=[x['ResourceChange'] for x in plan['Changes']]
    assert all(c['Action']=='Add' and c['LogicalResourceId'] in ['MonitorSecurityGroup','MonitorTask','MonitorInvokeRole','MonitorRule'] for c in changes)
    (ROOT/'monitor-changes.json').write_text(json.dumps(changes,indent=2)+'\n')
    job.aws('cloudformation','execute-change-set','--stack-name',job.STACK,'--change-set-name',change)
    for _ in range(120):
        stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0]
        if stack['StackStatus']=='UPDATE_COMPLETE':break
        if 'ROLLBACK' in stack['StackStatus'] or 'FAILED' in stack['StackStatus']:raise RuntimeError('Monitor deployment failed')
        time.sleep(5)
    else:raise RuntimeError('Monitor deployment timeout')
    outputs={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'image':repo+'@'+digest,'monitorTaskDefinitionArn':outputs['MonitorTaskDefinitionArn'],'monitorRuleArn':outputs['MonitorRuleArn'],'monitorSchedule':'rate(1 hour)','backupScheduleEnabled':False,'backupTaskDefinitionArn':outputs['TaskDefinitionArn']}
    (ROOT/'monitor-deployment.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Hourly restricted freshness monitor deployed; backup task and backup scheduling unchanged.')

if __name__=='__main__':main()
