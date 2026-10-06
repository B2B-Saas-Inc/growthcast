"""Staging signing-link lifetime correction; existing delivery container only."""
from pathlib import Path
import sys,importlib.util
R=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('delivery_image',R/'delivery-gateway.py')
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
g.OUT=R/'expiry-rollout/release/staging'
def accept():
 p=g.p
 stack=p.aws('cloudformation','describe-stacks','--stack-name','growthcast-portal-staging-api')['Stacks'][0]
 assert stack['StackStatus']=='UPDATE_COMPLETE'
 service=p.aws('ecs','describe-services','--cluster','growthcast-portal-staging-api','--services','growthcast-portal-staging-api')['services'][0]
 assert service['runningCount']==service['desiredCount']==1 and service['pendingCount']==0
 task=p.aws('ecs','describe-task-definition','--task-definition',service['taskDefinition'])['taskDefinition']
 prior=p.aws('ecs','describe-task-definition','--task-definition','growthcast-portal-staging-api:19')['taskDefinition']
 old={c['name']:c for c in prior['containerDefinitions']}
 for container in task['containerDefinitions']:
  before=old[container['name']]
  if container['name']=='guest':
   assert container['image']==p.load(g.OUT/'gateway-image.json')['image']
   before={**before,'image':container['image']}
  assert before==container,'Unexpected container configuration change'
 tasks=p.aws('ecs','list-tasks','--cluster','growthcast-portal-staging-api','--service-name','growthcast-portal-staging-api')['taskArns']
 runtime=p.aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-api','--tasks',*tasks)['tasks']
 assert len(runtime)==1 and runtime[0]['taskDefinitionArn']==service['taskDefinition']
 assert runtime[0]['healthStatus']=='HEALTHY'
 receipt=p.load(g.OUT/'gateway-image.json')
 p.save(g.OUT/'acceptance.json',{'at':p.legacy.c.now(),'environment':'staging','apiTaskRevision':task['revision'],'image':receipt['image'],'taskHealthy':True,'onlyGuestImageChanged':True,'schema':13,'maxNewDocumentLinkSeconds':604800,'sessionSeconds':3600,'handoffSeconds':60,'existingGrantsUnchanged':True,'gatewayChecks':37,'realLocalSigningAndDownloads':True,'productionChanged':False})
 print('Staging signing-link expiry release accepted')
if __name__=='__main__':{'image':g.image,'api':g.api,'accept':accept}[sys.argv[1]]()
