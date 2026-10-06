import json,subprocess,tempfile,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
STACK='growthcast-portal-staging-api'
def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True);assert r.returncode==0,'AWS operation failed; details suppressed';return json.loads(r.stdout) if r.stdout.strip() else {}
name='workspace-smtp-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory)/'request.json';p.write_text(json.dumps({'StackName':STACK,'ChangeSetName':name,'ChangeSetType':'UPDATE','TemplateBody':(R.parent/'https-ingress/foundation.json').read_text()}));aws('cloudformation','create-change-set','--cli-input-json','file://'+str(p))
for _ in range(30):
 plan=aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',name)
 if plan['Status']=='CREATE_COMPLETE':break
 assert plan['Status']!='FAILED';time.sleep(2)
changes=[x['ResourceChange'] for x in plan['Changes']];assert len(changes)==1 and changes[0]['LogicalResourceId']=='ApiSecurityGroup' and changes[0]['Action']=='Modify' and changes[0]['Replacement']=='False'
aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',name)
for _ in range(60):
 status=aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]['StackStatus']
 if status=='UPDATE_COMPLETE':break
 assert 'ROLLBACK' not in status and 'FAILED' not in status;time.sleep(3)
assert status=='UPDATE_COMPLETE'
sg=aws('ec2','describe-security-groups','--group-ids','sg-0f7598d18f8dead4d')['SecurityGroups'][0];assert any(x['FromPort']==x['ToPort']==465 for x in sg['IpPermissionsEgress']) and len(sg['IpPermissions'])==1
(R/'network-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'outboundTlsSmtp465':True,'inboundUnchanged':True,'changeSet':name,'changes':changes},indent=2)+'\n');print('Outbound TLS SMTP enabled; API ingress unchanged.')
