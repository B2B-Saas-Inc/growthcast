"""Private mail collector: no task role, RSA-encrypted output, temporary SG peer access."""
import json,subprocess,time,base64,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;P=Path('/tmp/growthcast-verified-private')
def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True)
 assert r.returncode==0,'AWS collector operation failed; details suppressed'
 return json.loads(r.stdout) if r.stdout.strip() else {}
def request(command,body):
 p=P/'request.json';p.write_text(json.dumps(body));return aws(*command,'--cli-input-json','file://'+str(p))
f=json.loads((P/'fixture.json').read_text());e=json.loads((R.parent/'https-ingress/deployment.json').read_text())['resources'];sg=task=definition=None
receipt={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def save(): (R/'collector-evidence.json').write_text(json.dumps(receipt,indent=2)+'\n')
try:
 ids=aws('ecs','list-tasks','--cluster',e['ClusterArn'],'--service-name','growthcast-portal-staging-api')['taskArns'];assert len(ids)==1
 serviceTask=aws('ecs','describe-tasks','--cluster',e['ClusterArn'],'--tasks',*ids)['tasks'][0]
 details={x['name']:x['value'] for a in serviceTask['attachments'] for x in a['details']};ip=details['privateIPv4Address'];subnet=details['subnetId']
 vpc=aws('ec2','describe-subnets','--subnet-ids',subnet)['Subnets'][0]['VpcId']
 sg=aws('ec2','create-security-group','--group-name',f['prefix']+'-mail-collector','--description','Temporary private staging mail acceptance','--vpc-id',vpc)['GroupId'];receipt['securityGroup']=sg;save()
 request(['ec2','revoke-security-group-egress'],{'GroupId':sg,'IpPermissions':[{'IpProtocol':'-1','IpRanges':[{'CidrIp':'0.0.0.0/0'}]}]})
 request(['ec2','authorize-security-group-egress'],{'GroupId':sg,'IpPermissions':[{'IpProtocol':'tcp','FromPort':443,'ToPort':443,'IpRanges':[{'CidrIp':'0.0.0.0/0'}]},{'IpProtocol':'tcp','FromPort':1080,'ToPort':1080,'UserIdGroupPairs':[{'GroupId':e['ApiSecurityGroup']}]}]})
 permission={'GroupId':e['ApiSecurityGroup'],'IpPermissions':[{'IpProtocol':'tcp','FromPort':1080,'ToPort':1080,'UserIdGroupPairs':[{'GroupId':sg}]}]}
 request(['ec2','authorize-security-group-ingress'],permission);receipt['peerIngress']=True;save()
 subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:4096','-out',str(P/'collector-key.pem')],check=True,capture_output=True);(P/'collector-key.pem').chmod(0o600)
 pub=subprocess.check_output(['openssl','pkey','-in',str(P/'collector-key.pem'),'-pubout'],stderr=subprocess.DEVNULL).decode()
 existing=aws('ecs','describe-task-definition','--task-definition',e['TaskDefinitionArn'])['taskDefinition'];api=next(x for x in existing['containerDefinitions'] if x['name']=='api')
 log={'logDriver':'awslogs','options':{**api['logConfiguration']['options'],'awslogs-stream-prefix':'invitation-collector'}}
 body={'family':'growthcast-staging-verification-collector','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'256','memory':'512','executionRoleArn':existing['executionRoleArn'],'runtimePlatform':existing['runtimePlatform'],'containerDefinitions':[{'name':'collector','image':api['image'],'essential':True,'user':'1000','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['/usr/local/bin/bun'],'command':['-e',(R/'mail-collector.mjs').read_text()],'environment':[{'name':'CAPTURE_ORIGIN','value':'http://'+ip+':1080'},{'name':'FIXTURE_EMAIL','value':f['prefix']+'-invited@growthcast.invalid'},{'name':'COLLECTOR_PUBLIC_KEY','value':pub}],'logConfiguration':log}]}
 definition=request(['ecs','register-task-definition'],body)['taskDefinition']['taskDefinitionArn'];receipt['taskDefinition']=definition;save()
 result=request(['ecs','run-task'],{'cluster':e['ClusterArn'],'taskDefinition':definition,'launchType':'FARGATE','count':1,'networkConfiguration':{'awsvpcConfiguration':{'subnets':[subnet],'securityGroups':[sg],'assignPublicIp':'ENABLED'}}});assert not result.get('failures');task=result['tasks'][0]['taskArn'];receipt['taskArn']=task;save();print('Private encrypted mail collector launched.',flush=True)
 for _ in range(70):
  t=aws('ecs','describe-tasks','--cluster',e['ClusterArn'],'--tasks',task)['tasks'][0]
  if t['lastStatus']=='STOPPED':break
  time.sleep(5)
 assert t['lastStatus']=='STOPPED' and t['containers'][0].get('exitCode')==0,'Collector did not complete'
 stream='invitation-collector/collector/'+task.rsplit('/',1)[1]
 for _ in range(10):
  events=aws('logs','get-log-events','--log-group-name',log['options']['awslogs-group'],'--log-stream-name',stream)['events']
  records=[json.loads(x['message']) for x in events if x['message'].startswith('{')]
  if len(records)==2:break
  time.sleep(2)
 encrypted=next(x['encryptedCapture'] for x in records if 'encryptedCapture' in x);plain=b''
 for block in encrypted:
  r=subprocess.run(['openssl','pkeyutl','-decrypt','-inkey',str(P/'collector-key.pem'),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'],input=base64.b64decode(block),capture_output=True);assert r.returncode==0;plain+=r.stdout
 messages=json.loads(plain);assert len(messages)>=2
 (P/'captured-mail.json').write_text(json.dumps(messages));(P/'captured-mail.json').chmod(0o600)
 receipt.update(captureCount=len(messages),encryptedLogsOnly=True,fixtureMessagesDeleted=next(x['fixtureMessagesDeleted'] for x in records if 'fixtureMessagesDeleted' in x),noTaskRole=True,result='passed');save()
finally:
 if task:
  t=aws('ecs','describe-tasks','--cluster',e['ClusterArn'],'--tasks',task)['tasks'][0]
  if t['lastStatus']!='STOPPED':aws('ecs','stop-task','--cluster',e['ClusterArn'],'--task',task,'--reason','Bounded mail acceptance cleanup')
 if receipt.get('peerIngress'):request(['ec2','revoke-security-group-ingress'],permission);receipt['peerIngressRemoved']=True;save()
 if definition:aws('ecs','deregister-task-definition','--task-definition',definition);receipt['taskDefinitionInactive']=True;save()
 if sg:
  for _ in range(35):
   try:aws('ec2','delete-security-group','--group-id',sg);receipt['securityGroupDeleted']=True;save();break
   except AssertionError:time.sleep(5)
  assert receipt.get('securityGroupDeleted'),'Temporary group cleanup incomplete'
print('Captured staging invitation/verification mail retrieved privately; collector resources removed.')
