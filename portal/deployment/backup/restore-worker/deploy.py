"""Publish and deploy an independent restore task, without a schedule."""
import datetime,importlib.util,json,os,subprocess,tempfile,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
STACK='growthcast-portal-staging-restore-worker'
def main():
    assert not (ROOT/'deployment.json').exists(),'Existing deployment requires explicit revision review'
    assert job.aws('sts','get-caller-identity')['Account']=='059393269249'
    repo='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup';tag='restore-'+str(uuid.uuid4())
    context=json.loads(subprocess.run(['docker','context','inspect'],capture_output=True,text=True,check=True).stdout)[0]
    with tempfile.TemporaryDirectory() as d:
        env=os.environ.copy();env.pop('DOCKER_CONTEXT',None);env['DOCKER_CONFIG']=d;env['DOCKER_HOST']=context['Endpoints']['docker']['Host']
        password=job.command(['ecr','get-login-password'])
        assert subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=password,env=env,capture_output=True).returncode==0
        for args in [['tag','growthcast-restore-worker',repo+':'+tag],['push',repo+':'+tag]]:assert subprocess.run(['docker',*args],env=env,capture_output=True).returncode==0
    digest=job.aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest'];image=repo+'@'+digest
    change='restore-'+str(uuid.uuid4())
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);request={'StackName':STACK,'ChangeSetName':change,'ChangeSetType':'CREATE','Capabilities':['CAPABILITY_NAMED_IAM'],'TemplateBody':(ROOT/'foundation.json').read_text(),'Parameters':[{'ParameterKey':'Image','ParameterValue':image}]};(p/'request.json').write_text(json.dumps(request));job.aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=p)
    for _ in range(60):
        plan=job.aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        if plan['Status']=='FAILED':raise RuntimeError('Restore change set failed')
        time.sleep(3)
    else:raise RuntimeError('Change set timeout')
    changes=[x['ResourceChange'] for x in plan['Changes']];assert len(changes)==2 and all(x['Action']=='Add' and x['LogicalResourceId'] in ['Role','Task'] for x in changes)
    (ROOT/'changes.json').write_text(json.dumps(changes,indent=2)+'\n');job.aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',change)
    for _ in range(120):
        stack=job.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
        if stack['StackStatus']=='CREATE_COMPLETE':break
        if 'ROLLBACK' in stack['StackStatus'] or 'FAILED' in stack['StackStatus']:raise RuntimeError('Restore deployment failed')
        time.sleep(5)
    else:raise RuntimeError('Restore deployment timeout')
    out={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'image':image,'stack':STACK,**out,'scheduleEnabled':False}
    (ROOT/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');print('Independent restore task and scoped role deployed; no schedule enabled.')
if __name__=='__main__':main()
