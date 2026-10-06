"""Verify a full ECS task replacement, followed separately by HTTPS checks."""
import importlib.util,json,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('deploy',R/'deploy.py');d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
a=d.aws;o=json.loads((R/'deployment.json').read_text())['resources']
if (R/'replacement.json').exists():
 receipt=json.loads((R/'replacement.json').read_text());assert receipt['status']=='STARTING','Replacement already accepted'
 before=receipt['beforeTasks']
else:
 before=a('ecs','list-tasks','--cluster',o['ClusterArn'],'--service-name','growthcast-portal-staging-api')['taskArns'];assert len(before)==1
 receipt={'beforeTasks':before,'status':'STARTING'}
 (R/'replacement.json').write_text(json.dumps(receipt,indent=2)+'\n')
 a('ecs','update-service','--cluster',o['ClusterArn'],'--service',o['ServiceArn'],'--force-new-deployment')
 print('Full staging task replacement requested.',flush=True)
for _ in range(80):
 service=a('ecs','describe-services','--cluster',o['ClusterArn'],'--services',o['ServiceArn'])['services'][0]
 ids=a('ecs','list-tasks','--cluster',o['ClusterArn'],'--service-name','growthcast-portal-staging-api')['taskArns']
 if len(ids)==1 and not set(ids)&set(before) and len(service['deployments'])==1 and service['deployments'][0]['rolloutState']=='COMPLETED':
  old=a('ecs','describe-tasks','--cluster',o['ClusterArn'],'--tasks',*before)['tasks']
  if len(old)==len(before) and all(t['lastStatus']=='STOPPED' for t in old):break
 time.sleep(5)
else:raise RuntimeError('Replacement not yet accepted; receipt retained')
tasks=a('ecs','describe-tasks','--cluster',o['ClusterArn'],'--tasks',*(before+ids))['tasks']
assert all(t['lastStatus']=='STOPPED' for t in tasks if t['taskArn'] in before)
assert all(t['healthStatus']=='HEALTHY' for t in tasks if t['taskArn'] in ids)
receipt.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),afterTasks=ids,status='HEALTHY_REPLACEMENT',existingAccountPersistenceVerified=False)
(R/'replacement.json').write_text(json.dumps(receipt,indent=2)+'\n');print('New task healthy; previous task stopped. HTTPS verification required next.',flush=True)
