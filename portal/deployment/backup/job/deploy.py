"""Deploy the reviewed staging package and execute one task, never a schedule."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

ROOT=Path(__file__).resolve().parent
STACK='growthcast-portal-staging-backup-job'
IMAGE='amazon/aws-cli@sha256:f88a264623a4e6700f226ec3f90b902b1a4010810fce1edade1f269a7c071052'
REGION='us-east-1'

def command(args,mount=None):
    cmd=['docker','run','--rm','-v',str(Path.home()/'.aws')+':/root/.aws','-e','AWS_DEFAULT_REGION='+REGION]
    if mount:cmd+=['-v',str(mount)+':/input:ro']
    result=subprocess.run(cmd+[IMAGE,*args],capture_output=True)
    if result.returncode:raise RuntimeError('AWS deployment operation failed; upstream details withheld')
    return result.stdout

def aws(*args,mount=None):
    value=command(list(args),mount)
    return json.loads(value) if value else {}

def update_stack(zone,digest,exists):
    change='backup-'+str(uuid.uuid4())
    with tempfile.TemporaryDirectory(prefix='growthcast-job-plan-') as directory:
        folder=Path(directory)
        request={'StackName':STACK,'ChangeSetName':change,'ChangeSetType':'UPDATE' if exists else 'CREATE',
            'TemplateBody':(ROOT/'foundation.json').read_text(),'Capabilities':['CAPABILITY_NAMED_IAM'],
            'Parameters':[{'ParameterKey':'AvailabilityZone','ParameterValue':zone},{'ParameterKey':'ImageDigest','ParameterValue':digest}]}
        (folder/'request.json').write_text(json.dumps(request))
        aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=folder)
    for _ in range(60):
        plan=aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        if plan['Status']=='FAILED':raise RuntimeError('Change set failed; review retained AWS change set')
        time.sleep(3)
    else:raise RuntimeError('Change set timed out')
    changes=[entry['ResourceChange'] for entry in plan['Changes']]
    if exists:
        assert all(entry['LogicalResourceId']=='Task' and entry['Action'] in ['Add','Modify'] for entry in changes),'Unexpected infrastructure mutation'
    else:assert all(entry['Action']=='Add' for entry in changes),'Initial creation must only add resources'
    (ROOT/('image-change.json' if digest else 'foundation-change.json')).write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stack':STACK,'changeSet':change,'changes':changes},indent=2)+'\n')
    aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',change)
    for _ in range(120):
        stack=aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
        if stack['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE']:return stack
        if 'ROLLBACK' in stack['StackStatus'] or 'FAILED' in stack['StackStatus']:raise RuntimeError('Stack deployment failed')
        time.sleep(5)
    raise RuntimeError('Stack deployment timed out')

def main():
    os.umask(0o077)
    assert aws('sts','get-caller-identity')['Account']=='059393269249'
    stacks=aws('cloudformation','list-stacks','--stack-status-filter','CREATE_COMPLETE','UPDATE_COMPLETE')['StackSummaries']
    existing=next((stack for stack in stacks if stack['StackName']==STACK),None)
    if existing:
        stack=aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
        assert 'TaskDefinitionArn' not in {x['OutputKey'] for x in stack.get('Outputs',[])},'An existing deployed job requires explicit revision review'
        zone=next(p['ParameterValue'] for p in stack['Parameters'] if p['ParameterKey']=='AvailabilityZone')
    else:
        zones=aws('ec2','describe-availability-zones','--filters','Name=state,Values=available')['AvailabilityZones']
        zone=next(z['ZoneName'] for z in zones if z['ZoneType']=='availability-zone' and z['ZoneId']!='use1-az3')
        stack=update_stack(zone,'',False)
    outputs={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    repo=outputs['RepositoryUri'];assert repo=='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'
    tag='acceptance-'+str(uuid.uuid4())
    # Temporary Docker auth config; preserve the selected daemon without persisting registry credentials.
    context=json.loads(subprocess.run(['docker','context','inspect'],capture_output=True,text=True,check=True).stdout)[0]
    with tempfile.TemporaryDirectory(prefix='growthcast-ecr-auth-') as directory:
        env=os.environ.copy();env.pop('DOCKER_CONTEXT',None);env['DOCKER_CONFIG']=directory;env['DOCKER_HOST']=context['Endpoints']['docker']['Host']
        password=command(['ecr','get-login-password'])
        result=subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=password,capture_output=True,env=env)
        assert result.returncode==0,'Registry login failed'
        for args in [['tag','growthcast-backup-job',repo+':'+tag],['push',repo+':'+tag]]:
            result=subprocess.run(['docker',*args],capture_output=True,env=env)
            assert result.returncode==0,'Image publication failed'
    digest=aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
    stack=update_stack(zone,digest,True)
    outputs={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    run_task(outputs,repo+'@'+digest)

def run_task(outputs,image):
    if (ROOT/'deployment-evidence.json').exists():
        history=json.loads((ROOT/'deployment-history.json').read_text()) if (ROOT/'deployment-history.json').exists() else []
        previous=json.loads((ROOT/'deployment-evidence.json').read_text())
        assert previous['status']=='STOPPED','Prior acceptance task still active'
        history.append(previous)
        (ROOT/'deployment-history.json').write_text(json.dumps(history,indent=2)+'\n')
    request={'cluster':outputs['ClusterArn'],'taskDefinition':outputs['TaskDefinitionArn'],'launchType':'FARGATE','platformVersion':'1.4.0','count':1,
        'networkConfiguration':{'awsvpcConfiguration':{'subnets':[outputs['SubnetId']],'securityGroups':[outputs['SecurityGroupId']],'assignPublicIp':'ENABLED'}}}
    with tempfile.TemporaryDirectory(prefix='growthcast-task-run-') as directory:
        (Path(directory)/'request.json').write_text(json.dumps(request))
        run=aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=directory)
    assert not run.get('failures') and len(run['tasks'])==1,'Task launch failed'
    arn=run['tasks'][0]['taskArn']
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stack':STACK,'image':image,'taskArn':arn,'taskDefinitionArn':outputs['TaskDefinitionArn'],'cluster':outputs['ClusterArn'],'scheduleEnabled':False,'status':'RUNNING'}
    (ROOT/'deployment-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Digest-pinned one-off task launched; schedule remains disabled.',flush=True)
    for _ in range(150):
        task=aws('ecs','describe-tasks','--cluster',outputs['ClusterArn'],'--tasks',arn)['tasks'][0]
        if task['lastStatus']=='STOPPED':break
        time.sleep(10)
    else:
        aws('ecs','stop-task','--cluster',outputs['ClusterArn'],'--task',arn,'--reason','Bounded acceptance deadline')
        raise RuntimeError('One-off task exceeded acceptance deadline and was stopped')
    record.update(status='STOPPED',exitCodes=[c.get('exitCode') for c in task['containers']],stopCode=task.get('stopCode'),stoppedAt=task.get('stoppedAt'))
    (ROOT/'deployment-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    assert all(code==0 for code in record['exitCodes']),'Task failed; inspect bounded CloudWatch status logs'
    print('One-off ECS task completed successfully; independent archive verification remains required.')

if __name__=='__main__':main()
