"""Staging-only catalog CRUD rollout; retains all version/approval history."""
import sys,json,copy,uuid
from pathlib import Path
import prepare as p
import rollout as rollout
R=Path(__file__).resolve().parent/'catalog-rollout';OUT=R/'release/staging';OUT.mkdir(parents=True,exist_ok=True)
p.R=R;p.OUT=OUT;p.legacy.R=R
rollout.R=R;rollout.OUT=OUT;rollout.rr.R=R;rollout.old.R=R;rollout.old.rr.R=R
aws=p.aws;save=p.save;load=p.load;legacy=p.legacy

def inventory():
 assert aws('sts','get-caller-identity')['Account']=='059393269249'
 for kind in ['api','recovery']:
  stack=legacy.CONFIG['staging'][kind];s,o=legacy.info(stack);path=OUT/('before-'+kind+'.json')
  if not path.exists():save(path,{'template':legacy.template(stack),'outputs':o,'parameters':s.get('Parameters',[])})
 rows=legacy.c.supa('/v1/projects/saedetvoolpdysiyjwvg/database/query',{'query':'SELECT count(*)::int AS migrations FROM portal_meta.migrations','read_only':True})
 assert rows[0]['migrations'] in [10,11,12]
 print('Staging-only inventory verified; migration count '+str(rows[0]['migrations']),flush=True)

def pause_schedule():
 assert (OUT/'baseline-verified.json').exists()
 rec=load(OUT/'before-recovery.json')['outputs'];rule=rec['ScheduleArn'].split('/')[-1]
 if not (OUT/'schedule-before.json').exists():save(OUT/'schedule-before.json',aws('events','describe-rule','--name',rule))
 aws('events','disable-rule','--name',rule)
 assert not aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
 assert not aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
 save(OUT/'paused.json',{'scheduleDisabled':True,'recoveryIdle':True,'serviceDrained':False,'reason':'Additive catalog tables; original schema10 runtime remains compatible until replaced'})

def api():
 assert len(load(OUT/'migration.json')['migrations'])==12
 images=load(OUT/'images.json');before=load(OUT/'before-api.json')['template'];target=copy.deepcopy(before)
 for c in target['Resources']['Task']['Properties']['ContainerDefinitions']:
  if c['Name'] in ['api','guest']:c['Image']=images[c['Name']]
 rollout.update(legacy.CONFIG['staging']['api'],target,{'Task':['Modify'],'Service':['Modify']})
 _,outputs=legacy.info(legacy.CONFIG['staging']['api']);save(OUT/'api.json',{'outputs':outputs,'images':images,'template':target})

def alias():
 assert (OUT/'api.json').exists();d=load(OUT/'web.json');assert legacy.c.vercel('/v13/deployments/'+d['id'])['readyState']=='READY'
 legacy.c.vercel('/v2/deployments/'+d['id']+'/aliases',method='POST',body={'alias':'clients.staging.growthcast.app'})
 save(OUT/'alias.json',{'deployment':d['id'],'host':'clients.staging.growthcast.app','at':legacy.c.now()})

def recovery():
 assert (OUT/'catalog-recovery.json').exists()
 rec=load(OUT/'before-recovery.json')['outputs'];path=OUT/'catalog-execution.json'
 if not path.exists():
  assert not aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
  save(path,aws('stepfunctions','start-execution','--state-machine-arn',rec['StateMachineArn'],'--name','catalog-acceptance-'+uuid.uuid4().hex[:12],'--input','{}'))
 legacy.poll('staging','catalog')

def finish():
 for name in ['api','alias','browser','fixture-cleanup','catalog-verified']:assert (OUT/(name+'.json')).exists(),name
 for key in ['TargetGroupArn','GuestTargetGroupArn']:
  health=aws('elbv2','describe-target-health','--target-group-arn',load(OUT/'api.json')['outputs'][key])['TargetHealthDescriptions'];assert health and all(x['TargetHealth']['State']=='healthy' for x in health)
 before=load(OUT/'schedule-before.json');rule=load(OUT/'before-recovery.json')['outputs']['ScheduleArn'].split('/')[-1]
 if before['State']=='ENABLED':aws('events','enable-rule','--name',rule)
 assert aws('events','describe-rule','--name',rule)['State']==before['State']
 save(OUT/'acceptance.json',{'at':legacy.c.now(),'migration':12,'host':'clients.staging.growthcast.app','browserChecks':load(OUT/'browser.json')['passed'],'recovery':'VERIFIED','scheduleRestored':True,'fixtureCleanup':True,'liveSending':False,'productionChanged':False})

if __name__=='__main__':
 {'inventory':inventory,'baseline':lambda:legacy.baseline('staging'),'poll':lambda:legacy.poll('staging'),'images':lambda:p.images(catalog=True),'web':p.web,'pause':pause_schedule,'migrate':lambda:rollout.migration(expected=12),'api':api,'alias':alias,'recovery-images':lambda:rollout.rr.staging_recovery(load(OUT/'images.json'),'catalog'),'recovery':recovery,'finish':finish}[sys.argv[1]]()
