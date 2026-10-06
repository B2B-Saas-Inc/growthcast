"""Verify the new staging recovery path and restore its existing schedule."""
from prepare import *

def recovery():
 rec=load(OUT/'before-recovery.json')['outputs'];path=OUT/'guest-execution.json'
 if not path.exists():
  assert (OUT/'migration.json').exists() and (OUT/'guest-recovery.json').exists()
  assert not aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
  assert not aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
  save(path,aws('stepfunctions','start-execution','--state-machine-arn',rec['StateMachineArn'],'--name','guest-acceptance-'+uuid.uuid4().hex[:12],'--input','{}'))
 legacy.poll('staging','guest')


def finish():
 for name in ['api','alias','browser','fixture-cleanup','guest-verified','image-verification']:assert (OUT/(name+'.json')).exists(),name
 api=load(OUT/'api.json')['outputs']
 for target in ['TargetGroupArn','GuestTargetGroupArn']:
  health=aws('elbv2','describe-target-health','--target-group-arn',api[target])['TargetHealthDescriptions']
  assert health and all(x['TargetHealth']['State']=='healthy' for x in health)
 rec=load(OUT/'before-recovery.json')['outputs'];rule=rec['ScheduleArn'].split('/')[-1];before=load(OUT/'schedule-before.json')
 if before['State']=='ENABLED':aws('events','enable-rule','--name',rule)
 after=aws('events','describe-rule','--name',rule);assert after['State']==before['State'] and after['ScheduleExpression']==before['ScheduleExpression']
 save(OUT/'acceptance.json',{'at':legacy.c.now(),'host':'clients.staging.growthcast.app','migration':10,'apiHealth':'healthy','guestHealth':'healthy','browserChecks':load(OUT/'browser.json')['passed'],'recovery':'VERIFIED','fixtureCleanup':'passed','scheduleState':after['State'],'schedule':after['ScheduleExpression'],'deliveryEnabled':False,'scannerRemoved':True,'productionChanged':False})
 print('Staging document review release accepted; existing backup schedule restored',flush=True)

if __name__=='__main__':{'recovery':recovery,'finish':finish}[sys.argv[1]]()
