"""Coordinate the schema, service and web release after verified recovery."""
from release import *
import importlib.util
spec=__import__('importlib').util.spec_from_file_location('recovery_release',R/'recovery-release.py');rr=__import__('importlib').util.module_from_spec(spec);spec.loader.exec_module(rr)

def pause(env):
 out=R/'release'/env;cfg=CONFIG[env]
 assert (out/'baseline-verified.json').exists()
 if env=='production':assert (R/'release/staging/acceptance.json').exists(),'Staging acceptance required'
 assert load(out/'web.json')['readyState']=='READY'
 rec=load(out/'before-recovery.json')['outputs'];rule=rec['ScheduleArn'].split('/')[-1]
 if not (out/'schedule-before.json').exists():save(out/'schedule-before.json',aws('events','describe-rule','--name',rule))
 aws('events','disable-rule','--name',rule)
 assert not aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions'],'Wait for active recovery'
 assert not aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':env}}),'--consistent-read').get('Item'),'Reconcile recovery lock'
 api=load(out/'before-api.json')['outputs'];service=aws('ecs','describe-services','--cluster',api['ClusterArn'],'--services',api['ServiceArn'])['services'][0]
 if not (out/'service-before.json').exists():save(out/'service-before.json',{'desiredCount':service['desiredCount'],'taskDefinition':service['taskDefinition']})
 aws('ecs','update-service','--cluster',api['ClusterArn'],'--service',api['ServiceArn'],'--desired-count','0')
 for _ in range(120):
  s=aws('ecs','describe-services','--cluster',api['ClusterArn'],'--services',api['ServiceArn'])['services'][0]
  tasks=aws('ecs','list-tasks','--cluster',api['ClusterArn'],'--service-name',cfg['api'])['taskArns']
  if s['runningCount']==0 and s['pendingCount']==0 and not tasks:break
  time.sleep(3)
 else:raise RuntimeError('Service drain pending')
 save(out/'paused.json',{'at':c.now(),'serviceDrained':True,'scheduleDisabled':True,'recoveryIdle':True});print(env+': API drained and recovery schedule paused',flush=True)

def api(env):
 out=R/'release'/env;assert (out/'migration.json').exists()
 t=load(out/'before-api.json')['template'];image=load(out/'images.json')['api']
 containers=t['Resources']['Task']['Properties']['ContainerDefinitions'];next(x for x in containers if x['Name']=='api')['Image']=image
 # CloudFormation returns the service to its recorded desired count with the new task revision.
 t['Resources']['Service']['Properties']['DesiredCount']=load(out/'service-before.json')['desiredCount']
 result=rr.update(env,CONFIG[env]['api'],{}, {'Task','Service'},t,label='library-api')
 save(out/'api.json',{'outputs':result,'image':image,'template':t});print(env+': API update complete',flush=True)

def alias(env):
 out=R/'release'/env;assert (out/'api.json').exists();d=load(out/'web.json');assert c.vercel('/v13/deployments/'+d['id'])['readyState']=='READY'
 if env=='production':
  result=checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','growthcast-vercel-cli','promote',d['url'],'--yes','--scope','b2b-saas'])
 else:result=c.vercel('/v2/deployments/'+d['id']+'/aliases',method='POST',body={'alias':CONFIG[env]['host']})
 save(out/'alias.json',{'deployment':d['id'],'host':CONFIG[env]['host'],'at':c.now()});print(env+': frontend domain updated',flush=True)

def recovery_check(env):
 out=R/'release'/env;rec=load(out/'before-recovery.json')['outputs'];p=out/'library-execution.json'
 assert (out/'browser.json').exists()
 if not p.exists():
  assert not aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
  assert not aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':env}}),'--consistent-read').get('Item')
  save(p,aws('stepfunctions','start-execution','--state-machine-arn',rec['StateMachineArn'],'--name','library-acceptance-'+uuid.uuid4().hex[:12],'--input','{}'))
 poll(env,'library')

def finish(env):
 out=R/'release'/env
 for name in ['browser','library-verified','fixture-cleanup']:assert (out/(name+'.json')).exists()
 rec=load(out/'before-recovery.json')['outputs'];rule=rec['ScheduleArn'].split('/')[-1];before=load(out/'schedule-before.json')
 if before['State']=='ENABLED':aws('events','enable-rule','--name',rule)
 now=aws('events','describe-rule','--name',rule);assert now['State']==before['State'] and now['ScheduleExpression']==before['ScheduleExpression']
 api=load(out/'api.json')['outputs'];health=aws('elbv2','describe-target-health','--target-group-arn',api['TargetGroupArn'])['TargetHealthDescriptions'];assert health and all(x['TargetHealth']['State']=='healthy' for x in health)
 save(out/'acceptance.json',{'at':c.now(),'host':CONFIG[env]['host'],'migration':9,'browser':'passed','libraryObjectRecovery':'VERIFIED','fixtureCleanup':'passed','apiHealth':'healthy','schedule':now['ScheduleExpression'],'scheduleState':now['State']});print(env+': release accepted; original recovery schedule restored',flush=True)

if __name__=='__main__':
 mode,env=sys.argv[1:3];assert env in CONFIG
 {'pause':pause,'api':api,'alias':alias,'recovery':recovery_check,'finish':finish}[mode](env)
