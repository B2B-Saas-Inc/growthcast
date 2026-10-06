"""Staging recipient gateway and completion services on the existing API network."""
from pathlib import Path
import sys,json,time
import prepare as p
R=Path(__file__).resolve().parent/'signing-rollout';OUT=R/'release/staging'
STACK='growthcast-portal-staging-signing-services'
def template():
 network=p.load(R.parent/'signing-service/network.json');before=p.load(OUT/'before-api.json')['outputs']
 provider=p.load(R.parent/'signing-service/deployment.json')['outputs'];image=p.load(OUT/'images.json')['guest']
 ref=lambda key:{'Ref':key}
 resources={
  'ProviderEgress':{'Type':'AWS::EC2::SecurityGroupEgress','Properties':{'GroupId':network['ApiSecurityGroup'],'IpProtocol':'tcp','FromPort':3000,'ToPort':3000,'DestinationSecurityGroupId':provider['SecurityGroup']}},
  'GatewayEgress':{'Type':'AWS::EC2::SecurityGroupEgress','Properties':{'GroupId':network['LoadBalancerSecurityGroup'],'IpProtocol':'tcp','FromPort':3003,'ToPort':3003,'DestinationSecurityGroupId':network['ApiSecurityGroup']}},
  'GatewayIngress':{'Type':'AWS::EC2::SecurityGroupIngress','Properties':{'GroupId':network['ApiSecurityGroup'],'IpProtocol':'tcp','FromPort':3003,'ToPort':3003,'SourceSecurityGroupId':network['LoadBalancerSecurityGroup']}},
  'Target':{'Type':'AWS::ElasticLoadBalancingV2::TargetGroup','Properties':{'VpcId':network['Vpc'],'Port':3003,'Protocol':'HTTP','TargetType':'ip','HealthCheckPath':'/health','Matcher':{'HttpCode':'200'},'HealthCheckIntervalSeconds':15,'HealthyThresholdCount':2,'TargetGroupAttributes':[{'Key':'deregistration_delay.timeout_seconds','Value':'30'}]}}
 }
 # Staff routes retain priority 2; native Atrium /api/* retains priority 10.
 # Only signing APIs precede Atrium; remaining paths still pass the gateway's
 # exact per-session allowlist. Native provider API endpoints stay unreachable.
 for name,priority,paths in [('SigningApi',3,['/api/trpc/*','/api/files/token/*','/api/auth/session-json']),('SigningPage',20,['/*'])]:
  resources[name]={'Type':'AWS::ElasticLoadBalancingV2::ListenerRule','Properties':{'ListenerArn':before['ListenerArn'],'Priority':priority,'Conditions':[{'Field':'host-header','Values':['api.clients.staging.growthcast.app']},{'Field':'path-pattern','Values':paths}],'Actions':[{'Type':'forward','TargetGroupArn':ref('Target')}]}}
 outputs={'GatewayTargetArn':{'Value':ref('Target')}}
 for kind,port in [('gateway',3003),('lifecycle',3004)]:
  title=kind.title();task=title+'Task';service=title+'Service'
  container={'Name':kind,'Image':image,'Essential':True,'User':'1000:1000','ReadonlyRootFilesystem':True,'StopTimeout':120,'LinuxParameters':{'Capabilities':{'Drop':['ALL']},'InitProcessEnabled':True},'EntryPoint':['node'],'Command':['/app/guest-documents/runtime/signing-start.mjs'],'Environment':[{'Name':'GC_SIGNING_SERVICE','Value':kind}],'MountPoints':[{'SourceVolume':'private','ContainerPath':'/run/'+kind,'ReadOnly':False},{'SourceVolume':'tmp','ContainerPath':'/tmp','ReadOnly':False}],'PortMappings':[{'ContainerPort':port,'Protocol':'tcp'}],'HealthCheck':{'Command':['CMD','node','-e',"fetch('http://127.0.0.1:"+str(port)+"/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'Interval':15,'Timeout':5,'Retries':3,'StartPeriod':90},'LogConfiguration':{'LogDriver':'awslogs','Options':{'awslogs-group':'/growthcast/portal/staging/signing-provider','awslogs-region':'us-east-1','awslogs-stream-prefix':kind}}}
  resources[task]={'Type':'AWS::ECS::TaskDefinition','Properties':{'Family':'growthcast-portal-staging-signing-'+kind,'Cpu':'256','Memory':'512','NetworkMode':'awsvpc','RequiresCompatibilities':['FARGATE'],'RuntimePlatform':{'CpuArchitecture':'ARM64','OperatingSystemFamily':'LINUX'},'TaskRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-signing-'+kind,'ExecutionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-execution','Volumes':[{'Name':'private'},{'Name':'tmp'}],'ContainerDefinitions':[container]}}
  props={'ServiceName':'growthcast-portal-staging-signing-'+kind,'Cluster':network['Cluster'],'TaskDefinition':ref(task),'DesiredCount':ref('DesiredCount'),'LaunchType':'FARGATE','PlatformVersion':'1.4.0','DeploymentConfiguration':{'DeploymentCircuitBreaker':{'Enable':True,'Rollback':True},'MaximumPercent':200,'MinimumHealthyPercent':100},'NetworkConfiguration':{'AwsvpcConfiguration':{'Subnets':[network['Subnet0'],network['Subnet1']],'SecurityGroups':[network['ApiSecurityGroup']],'AssignPublicIp':'ENABLED'}}}
  if kind=='gateway':props.update({'HealthCheckGracePeriodSeconds':120,'LoadBalancers':[{'ContainerName':kind,'ContainerPort':port,'TargetGroupArn':ref('Target')}]})
  resources[service]={'Type':'AWS::ECS::Service','DependsOn':['SigningApi','SigningPage','ProviderEgress','GatewayIngress','GatewayEgress'],'Properties':props}
  outputs[title+'ServiceArn']={'Value':ref(service)}
 result={'AWSTemplateFormatVersion':'2010-09-09','Description':'Staging-only restricted recipient gateway and signature completion worker.','Parameters':{'DesiredCount':{'Type':'Number','Default':0,'AllowedValues':[0,1]}},'Resources':resources,'Outputs':outputs}
 p.save(OUT/'services-template.json',result);return result

def deploy():
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 path=OUT/'services-stack.json'
 if not path.exists():p.save(path,p.legacy.request(['cloudformation','create-stack'],{'StackName':STACK,'TemplateBody':json.dumps(template())}))
 print('Signing services infrastructure requested with zero running tasks',flush=True)
def status():
 stack=p.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
 assert 'FAILED' not in stack['StackStatus'] and 'ROLLBACK' not in stack['StackStatus']
 if stack['StackStatus']!='CREATE_COMPLETE':print('Signing infrastructure pending',flush=True);return
 p.save(OUT/'services-infrastructure.json',{'at':p.legacy.c.now(),'desiredCount':0,'outputs':{x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}})
 print('Signing infrastructure ready; service tasks remain stopped',flush=True)
def activate():
 assert len(p.load(OUT/'migration.json')['migrations'])==13
 assert (OUT/'provider-verified.json').exists()
 assert (OUT/'services-infrastructure.json').exists()
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 pins=p.load(R.parent/'signing-secrets/pins.json')
 for kind in ['gateway','lifecycle']:
  assert p.load(R.parent/'signing-secrets'/(kind+'-database.json'))['credentialVersion']==pins[kind]['version']
 p.legacy.c.supa('/v1/projects/saedetvoolpdysiyjwvg/database/query',{'query':'ALTER ROLE gc_gateway LOGIN; ALTER ROLE gc_lifecycle LOGIN;','read_only':False})
 p.save(OUT/'signing-logins.json',{'at':p.legacy.c.now(),'roles':['gc_gateway','gc_lifecycle'],'passwordsRotated':False})
 p.legacy.request(['cloudformation','update-stack'],{'StackName':STACK,'TemplateBody':json.dumps(template()),'Parameters':[{'ParameterKey':'DesiredCount','ParameterValue':'1'}]})
 print('Staging gateway and completion service activation requested',flush=True)
def healthy():
 stack=p.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
 assert 'FAILED' not in stack['StackStatus'] and 'ROLLBACK' not in stack['StackStatus']
 if stack['StackStatus']!='UPDATE_COMPLETE':print('Signing services pending',flush=True);return
 outputs={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
 services=p.aws('ecs','describe-services','--cluster','growthcast-portal-staging-api','--services',outputs['GatewayServiceArn'],outputs['LifecycleServiceArn'])['services']
 assert len(services)==2 and all(s['runningCount']==s['desiredCount']==1 and len(s['deployments'])==1 for s in services)
 health=p.aws('elbv2','describe-target-health','--target-group-arn',outputs['GatewayTargetArn'])['TargetHealthDescriptions'];assert health and all(t['TargetHealth']['State']=='healthy' for t in health)
 p.save(OUT/'services-healthy.json',{'at':p.legacy.c.now(),'outputs':outputs,'runningServices':2,'gatewayHealthy':True,'sendingEnabled':False})
 print('Restricted gateway and completion services healthy; sending disabled',flush=True)
def routes():
 import urllib.request,urllib.error
 assert (OUT/'services-healthy.json').exists()
 checks=[]
 for path,expected in [('/unlock',200),('/sign/not-a-real-token',404),('/api/trpc/envelope.signingStatus',404),('/api/files/token/not-real/envelope/not-real/item.pdf',404),('/api/auth/session-json',404),('/api/v2/envelope',403),('/api/guest/staff/catalog',404)]:
  try:
   with urllib.request.urlopen('https://api.clients.staging.growthcast.app'+path,timeout=30) as response:status=response.status
  except urllib.error.HTTPError as error:status=error.code
  assert status==expected,(path,status,expected)
  checks.append({'path':path,'status':status})
 p.save(OUT/'gateway-routes.json',{'at':p.legacy.c.now(),'checks':checks,'passed':len(checks),'nativeProviderPublic':False})
 print('Seven HTTPS gateway, private-provider and staff-route checks passed',flush=True)
if __name__=='__main__':{'template':template,'deploy':deploy,'status':status,'activate':activate,'healthy':healthy,'routes':routes}[sys.argv[1]]()
