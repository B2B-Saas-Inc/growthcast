"""Read-only production provider authentication probe on its actual private network."""
import sys,json
import provider as q
p=q.p;OUT=q.OUT
if sys.argv[1]=='start':
 path=OUT/'provider-probe.json'
 if path.exists():raise SystemExit()
 n=p.load(OUT/'network.json');pin=p.load(OUT/'signing-secrets/pins.json')['delivery'];code=q.transform((q.R.parent/'signing-provider-probe.mjs').read_text())
 task={'family':'growthcast-production-signing-probe','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'256','memory':'512','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'executionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-production-execution','taskRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-production-runtime','containerDefinitions':[{'name':'probe','image':p.load(OUT/'images.json')['guest'],'essential':True,'user':'1000:1000','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['node'],'command':['--input-type=module','-e',code],'environment':[{'name':'GC_DELIVERY_PIN','value':json.dumps(pin)}],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':'/growthcast/portal/production/signing-provider','awslogs-region':'us-east-1','awslogs-stream-prefix':'probe'}}}]}
 definition=p.request(['ecs','register-task-definition'],task)['taskDefinition']['taskDefinitionArn']
 started=p.request(['ecs','run-task'],{'cluster':n['Cluster'],'taskDefinition':definition,'launchType':'FARGATE','count':1,'networkConfiguration':{'awsvpcConfiguration':{'subnets':[n['Subnet0'],n['Subnet1']],'securityGroups':[n['ApiSecurityGroup']],'assignPublicIp':'ENABLED'}}});assert not started.get('failures')
 p.save(path,{'definition':definition,'task':started['tasks'][0]['taskArn']});print('Production private provider probe started')
elif sys.argv[1]=='finish':
 state=p.load(OUT/'provider-probe.json');task=p.aws('ecs','describe-tasks','--cluster','growthcast-portal-production-api','--tasks',state['task'])['tasks'][0]
 if task['lastStatus']!='STOPPED':print('Provider probe pending');raise SystemExit()
 p.aws('ecs','deregister-task-definition','--task-definition',state['definition']);assert task['containers'][0].get('exitCode')==0
 p.save(OUT/'provider-verified.json',{'at':p.c.now(),'privateProviderAuthenticated':True,'unauthorizedDenials':2,'writes':0,'taskDefinitionDeregistered':True});print('Production private provider authentication verified')
else:raise ValueError('Unknown operation')
