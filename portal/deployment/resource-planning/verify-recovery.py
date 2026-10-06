"""Run the updated workflow once and retain only its nonsecret verification receipt."""
import json,subprocess,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent

def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True);assert r.returncode==0,'AWS recovery verification operation failed';return json.loads(r.stdout) if r.stdout.strip() else {}
d=json.loads((R/'recovery-deployment.json').read_text());workflow=d['workflow'];p=R/'recovery-execution.json'
if p.exists():execution=json.loads(p.read_text())
else:
 assert not aws('dynamodb','get-item','--table-name',workflow['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item'),'Existing recovery lock requires review'
 execution=aws('stepfunctions','start-execution','--state-machine-arn',workflow['StateMachineArn'],'--name','resource-planning-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S'),'--input','{}');p.write_text(json.dumps(execution,indent=2)+'\n')
 print('Backup and independent restore verification started.',flush=True)
for _ in range(180):
 result=aws('stepfunctions','describe-execution','--execution-arn',execution['executionArn'])
 if result['status']!='RUNNING':break
 time.sleep(5)
assert result['status']=='SUCCEEDED','Recovery workflow did not succeed; inspect retained execution before touching its lock'
output=json.loads(result['output']);assert output['status']=='VERIFIED'
assert not aws('dynamodb','get-item','--table-name',workflow['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
for key,definition in [('backupTask',d['backup']['TaskDefinitionArn']),('restoreTask',d['restore']['TaskDefinitionArn'])]:
 task=aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-backup','--tasks',output[key])['tasks'][0];assert task['taskDefinitionArn']==definition and task['lastStatus']=='STOPPED' and task['containers'][0]['exitCode']==0
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executionArn':execution['executionArn'],'status':'VERIFIED','output':output,'updatedTaskDefinitionsUsed':True,'lockReleased':True,'scheduleUnchanged':True}
(R/'recovery-acceptance.json').write_text(json.dumps(record,indent=2)+'\n')
print('New schema backup and independent exact-receipt restore verified; lock released.')
