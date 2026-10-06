from common import *
name='growthcast-portal-production-api';image=load(R/'images.json')['api']
# Replace only this new production service's failed initial task; never touch staging.
s=aws('ecs','describe-services','--cluster',name,'--services',name)['services'][0]
td=aws('ecs','describe-task-definition','--task-definition',s['taskDefinition'])['taskDefinition']
assert td['taskRoleArn']==load(R/'foundation-resources.json')['RuntimeRoleArn']
td={k:v for k,v in td.items() if k in ['family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','requiresCompatibilities','cpu','memory','runtimePlatform']}
td['containerDefinitions'][0]['image']=image
new=aws_request(['ecs','register-task-definition'],td)['taskDefinition']['taskDefinitionArn']
aws('ecs','update-service','--cluster',name,'--service',name,'--task-definition',new)
t=load(R/'api-foundation.json');t['Resources']['Task']['Properties']['ContainerDefinitions'][0]['Image']=image;save(R/'api-foundation.json',t)
save(R/'api-reconciliation.json',{'taskDefinition':new,'image':image,'reason':'Correct non-root readable configuration file modes','cloudFormationReconciliationPending':True})
print('Corrected production task deployed; waiting for health and CloudFormation reconciliation.',flush=True)
