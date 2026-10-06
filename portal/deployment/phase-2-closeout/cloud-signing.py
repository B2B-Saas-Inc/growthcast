"""Bounded managed-provider certificate startup, without exposing native signing routes."""
import os,json,subprocess,tempfile,time,datetime
from pathlib import Path
from aws import aws,request
R=Path(__file__).resolve().parent
assert not (R/'cloud-signing-evidence.json').exists()
imageFile=R/'documenso-image.json'
if imageFile.exists():image=json.loads(imageFile.read_text())['image']
else:
 repo='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup';tag='phase2-documenso-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')
 with tempfile.TemporaryDirectory() as directory:
  env={**os.environ,'DOCKER_CONFIG':directory};token=subprocess.run(['aws','ecr','get-login-password','--region','us-east-1'],capture_output=True);assert token.returncode==0
  assert subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=token.stdout,capture_output=True,env=env).returncode==0
  for args in [['tag','growthcast-documenso-runtime',repo+':'+tag],['push',repo+':'+tag]]:assert subprocess.run(['docker',*args],capture_output=True,env=env).returncode==0
 image=repo+'@'+aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest'];imageFile.write_text(json.dumps({'image':image},indent=2)+'\n')
print('Pinned provider image published; beginning managed certificate health check.',flush=True)
out={x['OutputKey']:x['OutputValue'] for x in aws('cloudformation','describe-stacks','--stack-name','growthcast-portal-staging-backup-job')['Stacks'][0]['Outputs']}
cert=json.loads((R/'certificate.json').read_text());code=(R/'certificate-cloud-probe.mjs').read_text();uid='1001'
volumes=['delivered','origin','connections','storage','config','tmp'];env={'GC_SERVICE':'documenso','GC_SECRET_MODE':'secretsmanager','GC_CONNECTION_MODE':'secretsmanager','SUPABASE_PROJECT_REF':'saedetvoolpdysiyjwvg','SIGNING_CERTIFICATE_PIN':json.dumps({'arn':cert['arn'],'version':cert['version']})}
# Match the existing application's execution role; no IAM privilege expansion.
prior=json.loads((R.parent/'runtime-connections/package-probe-tasks.json').read_text());old=prior['definitions'][-1];execution=aws('ecs','describe-task-definition','--task-definition',old)['taskDefinition']['executionRoleArn']
definition={'family':'growthcast-phase2-signing-certificate','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'1024','memory':'2048','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'taskRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-documenso-runtime','executionRoleArn':execution,'volumes':[{'name':v} for v in volumes],'containerDefinitions':[{'name':'probe','image':image,'essential':True,'user':uid,'readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['/usr/local/bin/node'],'command':['--input-type=module','-e',code],'environment':[{'name':k,'value':v} for k,v in env.items()],'mountPoints':[{'sourceVolume':v,'containerPath':'/tmp' if v=='tmp' else '/run/'+v,'readOnly':False} for v in volumes],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':out['LogGroup'],'awslogs-region':'us-east-1','awslogs-stream-prefix':'phase2-signing'}}}]}
taskdef=request(['ecs','register-task-definition'],definition)['taskDefinition']['taskDefinitionArn'];task=None
config=Path.home()/'.config/growthcast/portal-staging'
def role(mode):
 r=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(config/'database-url')+':/source/database-url:ro','-v',str(config/'prod-ca-2021.crt')+':/source/prod-ca-2021.crt:ro','-v',str(R/'provider-role.mjs')+':/role.mjs:ro','growthcast-atrium-runtime','/role.mjs',mode],capture_output=True,text=True);assert r.returncode==0,'Provider role control failed'
try:
 role('enable')
 run=request(['ecs','run-task'],{'cluster':out['ClusterArn'],'taskDefinition':taskdef,'launchType':'FARGATE','count':1,'platformVersion':'1.4.0','networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['SecurityGroupId']],'assignPublicIp':'ENABLED'}}});assert not run.get('failures');task=run['tasks'][0]['taskArn'];(R/'cloud-signing-task.json').write_text(json.dumps({'task':task,'taskDefinition':taskdef,'cluster':out['ClusterArn']},indent=2)+'\n')
 for _ in range(120):
  state=aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',task)['tasks'][0]
  if state['lastStatus']=='STOPPED':break
  time.sleep(5)
 assert state['lastStatus']=='STOPPED','Probe timeout'
 logs=aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','phase2-signing/probe/'+task.split('/')[-1],'--start-from-head')['events']
 records=[]
 for event in logs:
  try:v=json.loads(event['message'])
  except ValueError:continue
  if v.get('stage') in ['VERIFIED','FAILED']:records.append(v)
 if state['containers'][0].get('exitCode')!=0:print(records)
 assert state['containers'][0].get('exitCode')==0 and len(records)==1 and records[0]['managedSigningCertificateHealthy']
 (R/'cloud-signing-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'image':image,'task':task,'certificateVersion':cert['version'],'certificateTrust':'staging-self-signed','nativeRoutesPublic':False,**records[0]},indent=2)+'\n')
finally:
 if task:
  state=aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',task)['tasks'][0]
  if state['lastStatus']!='STOPPED':aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',task,'--reason','Phase 2 bounded probe cleanup')
 role('disable');aws('ecs','deregister-task-definition','--task-definition',taskdef)
print('Managed Documenso certificate and database health verified; task stopped and provider login disabled.')
