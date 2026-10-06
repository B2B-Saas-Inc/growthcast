"""Signing rollout preparation, isolated from prior catalog release receipts."""
from pathlib import Path
import sys,json,copy,uuid
import rollout
import prepare as p
R=Path(__file__).resolve().parent/'signing-rollout';OUT=R/'release/staging'
p.R=R;p.OUT=OUT;p.legacy.R=R
rollout.R=R;rollout.OUT=OUT;rollout.rr.R=R;rollout.old.R=R;rollout.old.rr.R=R
def inventory():
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 OUT.mkdir(parents=True,exist_ok=True)
 for kind in ['api','recovery']:
  name=p.legacy.CONFIG['staging'][kind];stack,outputs=p.legacy.info(name);path=OUT/('before-'+kind+'.json')
  if not path.exists():p.save(path,{'template':p.legacy.template(name),'outputs':outputs,'parameters':stack.get('Parameters',[])})
 rows=p.legacy.c.supa('/v1/projects/saedetvoolpdysiyjwvg/database/query',{'query':'SELECT count(*)::int AS migrations FROM portal_meta.migrations','read_only':True})
 assert rows[0]['migrations'] in [12,13]
 p.save(OUT/'inventory.json',{'at':p.legacy.c.now(),'migrations':rows[0]['migrations'],'environment':'staging','productionChanged':False})
 print('Signing release baseline recorded for staging',flush=True)
def images():
 p.checked(['sh',str(p.P/'deployment/runtime/build-atrium.sh'),str(p.P/'checkouts/atrium')])
 p.images(signing=True)
def pause():
 assert (OUT/'baseline-verified.json').exists()
 rec=p.load(OUT/'before-recovery.json')['outputs'];rule=rec['ScheduleArn'].split('/')[-1]
 if not (OUT/'schedule-before.json').exists():p.save(OUT/'schedule-before.json',p.aws('events','describe-rule','--name',rule))
 p.aws('events','disable-rule','--name',rule)
 assert not p.aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
 assert not p.aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
 p.save(OUT/'paused.json',{'scheduleDisabled':True,'recoveryIdle':True,'serviceDrained':False,'reason':'Additive signing migration; sending stays disabled during runtime and recovery replacement'})
def api():
 assert len(p.load(OUT/'migration.json')['migrations'])==13
 images=p.load(OUT/'images.json');target=copy.deepcopy(p.load(OUT/'before-api.json')['template'])
 for container in target['Resources']['Task']['Properties']['ContainerDefinitions']:
  if container['Name'] in ['api','guest']:container['Image']=images[container['Name']]
 rollout.update(p.legacy.CONFIG['staging']['api'],target,{'Task':['Modify'],'Service':['Modify']})
 _,outputs=p.legacy.info(p.legacy.CONFIG['staging']['api']);p.save(OUT/'api.json',{'outputs':outputs,'images':images,'template':target,'sendingEnabled':False})
def recovery():
 assert (OUT/'signing-recovery.json').exists()
 rec=p.load(OUT/'before-recovery.json')['outputs'];path=OUT/'signing-execution.json'
 if not path.exists():
  assert not p.aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
  p.save(path,p.aws('stepfunctions','start-execution','--state-machine-arn',rec['StateMachineArn'],'--name','signing-acceptance-'+uuid.uuid4().hex[:12],'--input','{}'))
 p.legacy.poll('staging','signing')
def schedule():
 assert all((OUT/(name+'.json')).exists() for name in ['signing-verified','browser','fixture-cleanup'])
 for key in ['TargetGroupArn','GuestTargetGroupArn']:
  health=p.aws('elbv2','describe-target-health','--target-group-arn',p.load(OUT/'before-api.json')['outputs'][key])['TargetHealthDescriptions']
  assert health and all(t['TargetHealth']['State']=='healthy' for t in health)
 before=p.load(OUT/'schedule-before.json');rule=p.load(OUT/'before-recovery.json')['outputs']['ScheduleArn'].split('/')[-1]
 if before['State']=='ENABLED':p.aws('events','enable-rule','--name',rule)
 assert p.aws('events','describe-rule','--name',rule)['State']==before['State']
 p.save(OUT/'schedule-restored.json',{'at':p.legacy.c.now(),'state':before['State']})
 print('Original daily recovery schedule restored',flush=True)
def probe_start():
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 path=OUT/'provider-probe.json'
 if path.exists():return
 network=p.load(R.parent/'signing-service/network.json')
 before=p.load(OUT/'before-api.json')
 execution=p.aws('ecs','describe-task-definition','--task-definition',before['outputs']['TaskDefinitionArn'])['taskDefinition']['executionRoleArn']
 pin=p.load(R.parent/'signing-secrets/pins.json')['delivery']
 task={'family':'growthcast-staging-signing-provider-probe','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'256','memory':'512','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'executionRoleArn':execution,'taskRoleArn':'arn:aws:iam::059393269249:role/'+pin['role'],'containerDefinitions':[{'name':'probe','image':p.load(OUT/'images.json')['guest'],'essential':True,'user':'1000:1000','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['node'],'command':['--input-type=module','-e',(R.parent/'signing-provider-probe.mjs').read_text()],'environment':[{'name':'GC_DELIVERY_PIN','value':json.dumps(pin)}],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':'/growthcast/portal/staging/signing-provider','awslogs-region':'us-east-1','awslogs-stream-prefix':'provider-probe'}}}]}
 definition=p.legacy.request(['ecs','register-task-definition'],task)['taskDefinition']['taskDefinitionArn']
 result=p.legacy.request(['ecs','run-task'],{'cluster':network['Cluster'],'taskDefinition':definition,'launchType':'FARGATE','networkConfiguration':{'awsvpcConfiguration':{'subnets':[network['Subnet0'],network['Subnet1']],'securityGroups':[network['ApiSecurityGroup']],'assignPublicIp':'ENABLED'}}})
 assert not result.get('failures') and len(result['tasks'])==1
 p.save(path,{'task':result['tasks'][0]['taskArn'],'definition':definition})
 print('Read-only private provider probe started',flush=True)
def probe_finish():
 state=p.load(OUT/'provider-probe.json');network=p.load(R.parent/'signing-service/network.json')
 task=p.aws('ecs','describe-tasks','--cluster',network['Cluster'],'--tasks',state['task'])['tasks'][0]
 if task['lastStatus']!='STOPPED':print('Private provider probe pending',flush=True);return
 p.aws('ecs','deregister-task-definition','--task-definition',state['definition'])
 assert task['containers'][0].get('exitCode')==0,'Provider probe failed; inspect sanitized diagnostics'
 p.save(OUT/'provider-verified.json',{'at':p.legacy.c.now(),'privateProviderAuthenticated':True,'envelopes':0,'unauthorizedDenials':2,'writes':0,'taskDefinitionDeregistered':True})
 print('Private provider authentication and two access denials passed; no writes',flush=True)
def finish():
 for name in ['api','services-healthy','gateway-routes','provider-verified','signing-verified','browser','fixture-cleanup','schedule-restored','package-permissions']:assert (OUT/(name+'.json')).exists(),name
 api=p.load(OUT/'api.json')['outputs']
 for key in ['TargetGroupArn','GuestTargetGroupArn']:
  health=p.aws('elbv2','describe-target-health','--target-group-arn',api[key])['TargetHealthDescriptions'];assert health and all(t['TargetHealth']['State']=='healthy' for t in health)
 rows=p.legacy.c.supa('/v1/projects/saedetvoolpdysiyjwvg/database/query',{'query':"SELECT (SELECT count(*) FROM portal_meta.migrations)::int AS migrations,(SELECT count(*) FROM gc_atrium.guest_send)::int AS sends,(SELECT rolcanlogin FROM pg_roles WHERE rolname='gc_migrate') AS migration_login",'read_only':True})
 assert rows==[{'migrations':13,'sends':0,'migration_login':False}]
 p.save(OUT/'acceptance.json',{'at':p.legacy.c.now(),'scope':'staging signing infrastructure; normal sending disabled','migration':13,'apiTask':api['TaskDefinitionArn'],'gatewayAndLifecycleHealthy':True,'httpsAccessChecks':7,'staffClientBrowserChecks':10,'syntheticFixturesRemoved':True,'dataRecovery':'VERIFIED','signingSecretRecovery':'VERIFIED','dailyScheduleRestored':True,'liveSends':0,'sendingEnabled':False,'productionChanged':False,'remaining':'delivery-container commissioning and controlled live send/input/signature/canonical-project-attachment acceptance'})
 print('Staging signing infrastructure accepted; sending remains disabled',flush=True)
if __name__=='__main__':
 {'inventory':inventory,'baseline':lambda:p.legacy.baseline('staging'),'poll':lambda:p.legacy.poll('staging'),'images':images,'probe-start':probe_start,'probe-finish':probe_finish,'pause':pause,'migrate':lambda:rollout.migration(expected=13),'api':api,'recovery-images':lambda:rollout.rr.staging_recovery(p.load(OUT/'images.json'),'signing'),'recovery':recovery,'schedule':schedule,'finish':finish}[sys.argv[1]]()
