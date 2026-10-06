"""Update only recovery task images and pinned workflow task references."""
import json,subprocess,tempfile,os,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
REPO='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'
def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True);assert r.returncode==0,'AWS operation failed; diagnostics suppressed';return json.loads(r.stdout) if r.stdout.strip() else {}
def request(args,data):
 with tempfile.TemporaryDirectory() as d:
  p=Path(d)/'request.json';p.write_text(json.dumps(data));return aws(*args,'--cli-input-json','file://'+str(p))
def publish(local):
 with tempfile.TemporaryDirectory() as d:
  env={**os.environ,'DOCKER_CONFIG':d}
  token=subprocess.run(['aws','ecr','get-login-password','--region','us-east-1'],capture_output=True);assert token.returncode==0
  assert subprocess.run(['docker','login',REPO.split('/')[0],'--username','AWS','--password-stdin'],input=token.stdout,capture_output=True,env=env).returncode==0
  tag='planning-'+local+'-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')
  for command in [['tag',local,REPO+':'+tag],['push',REPO+':'+tag]]:assert subprocess.run(['docker',*command],capture_output=True,env=env).returncode==0
 return aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
def update(stack,parameters,allowed,template=None):
 current=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0];assert current['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE']
 if parameters and all(next(p['ParameterValue'] for p in current['Parameters'] if p['ParameterKey']==k)==v for k,v in parameters.items()):return {o['OutputKey']:o['OutputValue'] for o in current['Outputs']}
 change='planning-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')
 data={'StackName':stack,'ChangeSetName':change,'ChangeSetType':'UPDATE','Capabilities':['CAPABILITY_NAMED_IAM'],'Parameters':[{'ParameterKey':p['ParameterKey'],**({'ParameterValue':parameters[p['ParameterKey']]} if p['ParameterKey'] in parameters else {'UsePreviousValue':True})} for p in current.get('Parameters',[])]}
 data.update({'TemplateBody':json.dumps(template)} if template else {'UsePreviousTemplate':True})
 request(['cloudformation','create-change-set'],data)
 for _ in range(40):
  plan=aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',change)
  if plan['Status']=='CREATE_COMPLETE':break
  assert plan['Status']!='FAILED';time.sleep(2)
 changes=[c['ResourceChange'] for c in plan['Changes']]
 assert all(c['LogicalResourceId'] in allowed and c['Action']=='Modify' and (c['LogicalResourceId']=='Task' or c['Replacement']=='False') for c in changes),json.dumps(changes)
 (R/(stack+'-changes.json')).write_text(json.dumps(changes,indent=2)+'\n')
 aws('cloudformation','execute-change-set','--stack-name',stack,'--change-set-name',change)
 for _ in range(90):
  current=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]
  if current['StackStatus']=='UPDATE_COMPLETE':break
  assert 'ROLLBACK' not in current['StackStatus'] and 'FAILED' not in current['StackStatus'];time.sleep(3)
 assert current['StackStatus']=='UPDATE_COMPLETE'
 return {o['OutputKey']:o['OutputValue'] for o in current['Outputs']}
assert aws('sts','get-caller-identity')['Account']=='059393269249'
images=json.loads((R/'recovery-images.json').read_text()) if (R/'recovery-images.json').exists() else {name:publish(name) for name in ['growthcast-backup-job','growthcast-restore-worker']}
(R/'recovery-images.json').write_text(json.dumps(images,indent=2)+'\n')
backupDigest=images['growthcast-backup-job'];restoreDigest=images['growthcast-restore-worker']
# AWS task definitions are replaced in-place by CloudFormation; role/network scopes unchanged.
backup=update('growthcast-portal-staging-backup-job',{'ImageDigest':backupDigest},{'Task'})
restore=update('growthcast-portal-staging-restore-worker',{'Image':REPO+'@'+restoreDigest},{'Task'})
stack='growthcast-portal-staging-backup-orchestration'
template=aws('cloudformation','get-template','--stack-name',stack)['TemplateBody']
if isinstance(template,str):template=json.loads(template)
oldBackup=json.loads((R.parent/'backup/job/deployment-evidence.json').read_text())['taskDefinitionArn']
oldRestore=json.loads((R.parent/'backup/restore-worker/deployment.json').read_text())['TaskDefinitionArn']
raw=json.dumps(template);assert oldBackup in raw and oldRestore in raw
updated=raw.replace(oldBackup,backup['TaskDefinitionArn']).replace(oldRestore,restore['TaskDefinitionArn'])
if updated==raw:
 workflow={o['OutputKey']:o['OutputValue'] for o in aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]['Outputs']}
else:workflow=update(stack,{}, {'Workflow','WorkflowRole'},json.loads(updated))
record={'backup':backup,'restore':restore,'workflow':workflow,'backupImage':REPO+'@'+backupDigest,'restoreImage':REPO+'@'+restoreDigest,'status':'UPDATED','scheduleUnchanged':True}
(R/'recovery-deployment.json').write_text(json.dumps(record,indent=2)+'\n')
print('Recovery task images and workflow pins updated; schedule unchanged.')
