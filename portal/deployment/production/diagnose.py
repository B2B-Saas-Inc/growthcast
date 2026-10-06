from common import *
c='growthcast-portal-production-api'
td=aws('ecs','describe-task-definition','--task-definition',c)['taskDefinition']
td={k:v for k,v in td.items() if k in ['family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','requiresCompatibilities','cpu','memory','runtimePlatform']};td['family']='growthcast-production-diagnostic'
api=td['containerDefinitions'][0];api.pop('dependsOn',None);api.pop('healthCheck',None);api['command']=['--input-type=module','-e',(R/'api-diagnostic.mjs').read_text()];td['containerDefinitions']=[api]
d=aws_request(['ecs','register-task-definition'],td)['taskDefinition']['taskDefinitionArn']
resources=aws('cloudformation','list-stack-resources','--stack-name',c)['StackResourceSummaries'];rs={x['LogicalResourceId']:x['PhysicalResourceId'] for x in resources}
r=aws_request(['ecs','run-task'],{'cluster':c,'taskDefinition':d,'launchType':'FARGATE','count':1,'networkConfiguration':{'awsvpcConfiguration':{'subnets':[rs['Subnet0']],'securityGroups':[rs['ApiSecurityGroup']],'assignPublicIp':'ENABLED'}}})
assert not r.get('failures');save(R/'diagnostic-task.json',{'cluster':c,'taskDefinition':d,'task':r['tasks'][0]['taskArn']});print('Scoped startup diagnostic task launched; outputs contain stage names only.')
