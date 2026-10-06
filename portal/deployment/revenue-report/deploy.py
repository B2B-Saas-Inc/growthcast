"""Publish the resource-planning API image and apply only its reviewed task/service change."""
import json,subprocess,tempfile,os,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
STACK='growthcast-portal-staging-api'
def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True);assert r.returncode==0,'AWS operation failed; details suppressed';return json.loads(r.stdout) if r.stdout.strip() else {}
def request(args,body):
 with tempfile.TemporaryDirectory() as directory:
  p=Path(directory)/'request.json';p.write_text(json.dumps(body));return aws(*args,'--cli-input-json','file://'+str(p))
assert aws('sts','get-caller-identity')['Account']=='059393269249'
repo='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'
with tempfile.TemporaryDirectory() as directory:
 env={**os.environ,'DOCKER_CONFIG':directory}
 token=subprocess.run(['aws','ecr','get-login-password','--region','us-east-1'],capture_output=True);assert token.returncode==0
 login=subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=token.stdout,capture_output=True,env=env);assert login.returncode==0;del token
 tag='revenue-report-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')
 for args in [['tag','growthcast-atrium-runtime',repo+':'+tag],['push',repo+':'+tag]]:
  result=subprocess.run(['docker',*args],capture_output=True,env=env);assert result.returncode==0,'Image publication failed'
digest=aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
p=R.parent/'cloud-account/package-images.json';images=json.loads(p.read_text());images['atrium']=repo+'@'+digest;p.write_text(json.dumps(images,indent=2)+'\n')
subprocess.run(['python3','-B',str(R.parent/'https-ingress/build-template.py')],check=True,capture_output=True)
change='revenue-report-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')
request(['cloudformation','create-change-set'],{'StackName':STACK,'ChangeSetName':change,'ChangeSetType':'UPDATE','TemplateBody':(R.parent/'https-ingress/foundation.json').read_text()})
for _ in range(30):
 plan=aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',change)
 if plan['Status']=='CREATE_COMPLETE':break
 assert plan['Status']!='FAILED','Change set creation failed';time.sleep(2)
changes=[x['ResourceChange'] for x in plan['Changes']];assert {x['LogicalResourceId'] for x in changes}=={'Task','Service'}
assert all(x['Action']=='Modify' and (x['LogicalResourceId']=='Task' or x['Replacement']=='False') for x in changes)
record={'image':images['atrium'],'changeSet':change,'changes':changes,'status':'REVIEWED'};(R/'deployment.json').write_text(json.dumps(record,indent=2)+'\n')
aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',change);print('Reviewed API task/service update executing.',flush=True)
for _ in range(100):
 stack=aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
 if stack['StackStatus']=='UPDATE_COMPLETE':break
 assert 'ROLLBACK' not in stack['StackStatus'] and 'FAILED' not in stack['StackStatus'],'Stack update failed; reconcile retained receipt';time.sleep(5)
assert stack['StackStatus']=='UPDATE_COMPLETE'
p=R.parent/'https-ingress/deployment.json';d=json.loads(p.read_text());d.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='UPDATE_COMPLETE',resources={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']});p.write_text(json.dumps(d,indent=2)+'\n')
record.update(status='UPDATE_COMPLETE',taskDefinition=d['resources']['TaskDefinitionArn']);(R/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');print('Revenue report API deployed; browser acceptance pending.')
