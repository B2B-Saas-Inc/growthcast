"""Verify Google SMTP authentication from the deployed runtime/network; no mail sent."""
import json,subprocess,time,tempfile,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True);assert r.returncode==0,'AWS probe operation failed; details suppressed';return json.loads(r.stdout) if r.stdout.strip() else {}
def request(args,body):
 with tempfile.TemporaryDirectory() as directory:
  p=Path(directory)/'request.json';p.write_text(json.dumps(body));return aws(*args,'--cli-input-json','file://'+str(p))
cluster='growthcast-portal-staging-api';service=aws('ecs','describe-services','--cluster',cluster,'--services',cluster)['services'][0];source=aws('ecs','describe-task-definition','--task-definition',service['taskDefinition'])['taskDefinition']
api=next(c for c in source['containerDefinitions'] if c['name']=='api');assert api['image']==json.loads((R.parent/'cloud-account/package-images.json').read_text())['atrium']
script=(R.parent/'https-ingress/service.mjs').read_text().replace("'/upstream/apps/api/dist/main.js'","'-e',"+json.dumps((R/'cloud-auth-check.mjs').read_text())).replace("stdio:'ignore'","stdio:'inherit'")
api.update(name='smtp-auth-check',command=['--input-type=module','-e',script]);api.pop('dependsOn',None);api.pop('healthCheck',None);api.pop('portMappings',None);api['logConfiguration']['options']['awslogs-stream-prefix']='workspace-smtp-auth'
body={k:source[k] for k in ['networkMode','requiresCompatibilities','cpu','memory','executionRoleArn','taskRoleArn','runtimePlatform','volumes']};body.update(family='growthcast-workspace-smtp-auth',containerDefinitions=[api])
definition=request(['ecs','register-task-definition'],body)['taskDefinition']['taskDefinitionArn'];record={'taskDefinition':definition,'emailSent':False};task=None
try:
 result=request(['ecs','run-task'],{'cluster':cluster,'taskDefinition':definition,'launchType':'FARGATE','count':1,'networkConfiguration':service['networkConfiguration']});assert not result.get('failures');task=result['tasks'][0]['taskArn'];record['taskArn']=task;(R/'cloud-auth-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Non-sending SMTP authentication check started in the staging network.',flush=True)
 for _ in range(80):
  t=aws('ecs','describe-tasks','--cluster',cluster,'--tasks',task)['tasks'][0]
  if t['lastStatus']=='STOPPED':break
  time.sleep(4)
 assert t['lastStatus']=='STOPPED' and t['containers'][0].get('exitCode')==0,'SMTP probe failed'
 stream='workspace-smtp-auth/smtp-auth-check/'+task.rsplit('/',1)[1]
 for _ in range(10):
  logs=aws('logs','get-log-events','--log-group-name',api['logConfiguration']['options']['awslogs-group'],'--log-stream-name',stream)['events'];records=[json.loads(x['message']) for x in logs if x['message'].startswith('{')]
  found=next((x for x in records if 'smtpAuthentication' in x),None)
  if found:break
  time.sleep(2)
 assert found and found['smtpAuthentication'] and found['tlsVerified'] and found['emailSent'] is False
 record.update(found);record.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),sameRuntimeImageAndNetwork=True,taskStopped=True,result='passed')
finally:
 if task:
  t=aws('ecs','describe-tasks','--cluster',cluster,'--tasks',task)['tasks'][0]
  if t['lastStatus']!='STOPPED':aws('ecs','stop-task','--cluster',cluster,'--task',task,'--reason','SMTP probe cleanup')
 aws('ecs','deregister-task-definition','--task-definition',definition);record['taskDefinitionInactive']=True;(R/'cloud-auth-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
print('Google SMTP authenticated over verified TLS from the staging runtime; no email sent.')
