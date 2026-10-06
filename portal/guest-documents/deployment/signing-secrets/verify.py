"""Actual short-lived ECS consumers verify own-read and cross-read boundaries."""
from pathlib import Path
import sys,json,time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare as p
R=Path(__file__).resolve().parent
def start():
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 pins=p.load(R/'pins.json');pins['provider']=p.load(R.parent/'signing-service/provider-api-pin.json')
 network=p.load(R.parent/'signing-service/network.json');before=p.load(R.parent/'signing-service/before-api.json')
 execution=p.aws('ecs','describe-task-definition','--task-definition',before['outputs']['TaskDefinitionArn'])['taskDefinition']['executionRoleArn']
 state=p.load(R/'probes.json') if (R/'probes.json').exists() else {}
 for kind in ['delivery','gateway','lifecycle']:
  if kind in state:continue
  task={'family':'growthcast-staging-signing-secret-probe','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'256','memory':'512','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'executionRoleArn':execution,'taskRoleArn':'arn:aws:iam::059393269249:role/'+pins[kind]['role'],'containerDefinitions':[{'name':'probe','image':p.load(R.parent/'signing-service/image.json')['image'],'essential':True,'user':'1000:1000','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['/usr/local/bin/node'],'command':['-e',(R/'probe.cjs').read_text()],'environment':[{'name':'GC_SIGNING_KIND','value':kind},{'name':'GC_SIGNING_PINS','value':json.dumps(pins)}],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':'/growthcast/portal/staging/signing-provider','awslogs-region':'us-east-1','awslogs-stream-prefix':'credential-probe'}}}]}
  definition=p.legacy.request(['ecs','register-task-definition'],task)['taskDefinition']['taskDefinitionArn']
  result=p.legacy.request(['ecs','run-task'],{'cluster':network['Cluster'],'taskDefinition':definition,'launchType':'FARGATE','networkConfiguration':{'awsvpcConfiguration':{'subnets':[network['Subnet0'],network['Subnet1']],'securityGroups':[network['ApiSecurityGroup']],'assignPublicIp':'ENABLED'}}})
  assert not result.get('failures') and len(result['tasks'])==1
  state[kind]={'task':result['tasks'][0]['taskArn'],'definition':definition};p.save(R/'probes.json',state)
 print('Three isolated signing credential probes started',flush=True)
def finish():
 state=p.load(R/'probes.json');network=p.load(R.parent/'signing-service/network.json')
 for _ in range(90):
  tasks=p.aws('ecs','describe-tasks','--cluster',network['Cluster'],'--tasks',*[v['task'] for v in state.values()])['tasks']
  if len(tasks)==3 and all(t['lastStatus']=='STOPPED' for t in tasks):break
  time.sleep(5)
 else:print('Credential probes pending; resume finish',flush=True);return
 assert all(len(t['containers'])==1 and t['containers'][0].get('exitCode')==0 for t in tasks),'Probe failed; inspect only sanitized diagnostics'
 for value in state.values():p.aws('ecs','deregister-task-definition','--task-definition',value['definition'])
 p.save(R/'verification.json',{'at':p.legacy.c.now(),'actualEcsConsumers':3,'ownPinnedSecretReads':3,'crossSecretDenials':9,'databaseLoginsEnabled':False,'taskDefinitionsDeregistered':True})
 print('All three ECS consumers passed: 3 own reads, 9 cross-secret denials',flush=True)
if __name__=='__main__':{'start':start,'finish':finish}[sys.argv[1]]()
