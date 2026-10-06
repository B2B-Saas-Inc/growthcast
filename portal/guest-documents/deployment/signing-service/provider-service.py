"""Persistent staging-only private provider on the existing portal VPC/cluster."""
from pathlib import Path
import sys,json,os,tempfile,uuid,time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare as p
R=Path(__file__).resolve().parent;STACK='growthcast-portal-staging-signing-provider'
aws=p.aws;save=p.save;load=p.load;checked=p.checked

def build():
 if (R/'image.json').exists():return
 repo=p.REPO;image=repo+':signing-provider-'+uuid.uuid4().hex[:12]
 base=load(p.P/'deployment/phase-2-closeout/documenso-image.json')['image']
 with tempfile.TemporaryDirectory(prefix='growthcast-signing-image-') as td:
  root=Path(td);(root/'provider-start.mjs').write_bytes((R/'provider-start.mjs').read_bytes());save(root/'signing-certificate-pin.json',{k:v for k,v in load(p.P/'deployment/phase-2-closeout/certificate.json').items() if k in ['arn','version']})
  (root/'Dockerfile').write_text('FROM '+base+'\nCOPY --chown=1001:65533 provider-start.mjs /boundary/provider-start.mjs\nCOPY --chown=1001:65533 signing-certificate-pin.json /boundary/signing-certificate-pin.json\nENTRYPOINT ["/usr/local/bin/node","/boundary/provider-start.mjs"]\nCMD []\n')
  context=json.loads(checked(['docker','context','inspect']))[0];env={**os.environ,'DOCKER_CONFIG':td+'/auth','DOCKER_HOST':context['Endpoints']['docker']['Host']};env.pop('DOCKER_CONTEXT',None)
  checked(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=checked(['aws','ecr','get-login-password','--region','us-east-1']),env=env)
  checked(['docker','build','--platform','linux/arm64','-t',image,td],env=env);checked(['docker','push',image],env=env)
 digest=aws('ecr','describe-images','--repository-name',repo.split('/')[-1],'--image-ids','imageTag='+image.split(':')[-1])['imageDetails'][0]['imageDigest'];save(R/'image.json',{'image':repo+'@'+digest,'base':base})
 print('Private provider image published',flush=True)

def template():
 n=load(R/'network.json');before=load(R/'before-api.json');task=aws('ecs','describe-task-definition','--task-definition',before['outputs']['TaskDefinitionArn'])['taskDefinition'];image=load(R/'image.json')['image']
 ref=lambda k:{'Ref':k};get=lambda k,v:{'Fn::GetAtt':[k,v]}
 volumes=['delivered','origin','connections','storage','config','tmp']
 t={'AWSTemplateFormatVersion':'2010-09-09','Description':'Private staging Documenso provider; existing VPC, cluster, runtime role and secrets.','Resources':{
  'Namespace':{'Type':'AWS::ServiceDiscovery::PrivateDnsNamespace','Properties':{'Name':'signing.staging.growthcast.internal','Vpc':n['Vpc']}},
  'Discovery':{'Type':'AWS::ServiceDiscovery::Service','Properties':{'Name':'documenso','DnsConfig':{'NamespaceId':ref('Namespace'),'DnsRecords':[{'Type':'A','TTL':10}],'RoutingPolicy':'MULTIVALUE'},'HealthCheckCustomConfig':{'FailureThreshold':1}}},
  'SecurityGroup':{'Type':'AWS::EC2::SecurityGroup','Properties':{'GroupDescription':'Documenso reachable only from portal service','VpcId':n['Vpc'],'SecurityGroupIngress':[{'IpProtocol':'tcp','FromPort':3000,'ToPort':3000,'SourceSecurityGroupId':n['ApiSecurityGroup']}],'SecurityGroupEgress':[{'IpProtocol':'-1','CidrIp':'0.0.0.0/0'}]}},
  'Logs':{'Type':'AWS::Logs::LogGroup','Properties':{'LogGroupName':'/growthcast/portal/staging/signing-provider','RetentionInDays':14}},
  'Task':{'Type':'AWS::ECS::TaskDefinition','Properties':{'Family':'growthcast-portal-staging-signing-provider','NetworkMode':'awsvpc','RequiresCompatibilities':['FARGATE'],'Cpu':'1024','Memory':'2048','RuntimePlatform':{'CpuArchitecture':'ARM64','OperatingSystemFamily':'LINUX'},'TaskRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-documenso-runtime','ExecutionRoleArn':task['executionRoleArn'],'Volumes':[{'Name':v} for v in volumes],
   'ContainerDefinitions':[{'Name':'provider','Image':image,'Essential':True,'User':'1001:65533','ReadonlyRootFilesystem':True,'LinuxParameters':{'Capabilities':{'Drop':['ALL']}},'PortMappings':[{'ContainerPort':3000,'Protocol':'tcp'}],'Environment':[{'Name':k,'Value':v} for k,v in {'GC_SERVICE':'documenso','GC_SECRET_MODE':'secretsmanager','GC_CONNECTION_MODE':'secretsmanager','SUPABASE_PROJECT_REF':'saedetvoolpdysiyjwvg'}.items()],
    'MountPoints':[{'SourceVolume':v,'ContainerPath':'/tmp' if v=='tmp' else '/run/'+v,'ReadOnly':False} for v in volumes],'HealthCheck':{'Command':['CMD','/usr/local/bin/node','-e',"fetch('http://127.0.0.1:3000/api/health').then(async r=>{const h=await r.json();process.exit(r.ok&&h.checks?.database?.status==='ok'&&h.checks?.certificate?.status==='ok'?0:1)}).catch(()=>process.exit(1))"],'Interval':15,'Timeout':5,'Retries':3,'StartPeriod':90},'LogConfiguration':{'LogDriver':'awslogs','Options':{'awslogs-group':ref('Logs'),'awslogs-region':'us-east-1','awslogs-stream-prefix':'provider'}}}]}},
  'Service':{'Type':'AWS::ECS::Service','DependsOn':['Logs'],'Properties':{'ServiceName':'growthcast-portal-staging-signing-provider','Cluster':n['Cluster'],'TaskDefinition':ref('Task'),'DesiredCount':1,'LaunchType':'FARGATE','PlatformVersion':'1.4.0','DeploymentConfiguration':{'DeploymentCircuitBreaker':{'Enable':True,'Rollback':True},'MaximumPercent':200,'MinimumHealthyPercent':100},'NetworkConfiguration':{'AwsvpcConfiguration':{'Subnets':[n['Subnet0'],n['Subnet1']],'SecurityGroups':[ref('SecurityGroup')],'AssignPublicIp':'ENABLED'}},'ServiceRegistries':[{'RegistryArn':get('Discovery','Arn')}]}}
 },'Outputs':{'ServiceArn':{'Value':ref('Service')},'TaskDefinitionArn':{'Value':ref('Task')},'SecurityGroup':{'Value':ref('SecurityGroup')},'DiscoveryArn':{'Value':get('Discovery','Arn')},'PrivateOrigin':{'Value':'http://documenso.signing.staging.growthcast.internal:3000'}}}
 save(R/'template.json',t);return t

def enable_role():
 assert aws('sts','get-caller-identity')['Account']=='059393269249'
 sql="DO $$ BEGIN IF EXISTS(SELECT 1 FROM gc_documenso.\"Envelope\") THEN RAISE EXCEPTION 'Existing provider documents need reconciliation'; END IF; ALTER ROLE gc_documenso LOGIN VALID UNTIL 'infinity'; END $$;"
 p.legacy.c.supa('/v1/projects/saedetvoolpdysiyjwvg/database/query',{'query':sql,'read_only':False});save(R/'provider-role.json',{'role':'gc_documenso','login':True,'at':p.legacy.c.now(),'existingEnvelopes':0});print('Staging provider role enabled',flush=True)

def deploy():
 assert aws('sts','get-caller-identity')['Account']=='059393269249'
 assert (R/'provider-role.json').exists()
 t=template()
 role=t['Resources']['Task']['Properties']['ExecutionRoleArn'].split('/')[-1]
 policy={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['logs:CreateLogStream','logs:PutLogEvents'],'Resource':'arn:aws:logs:us-east-1:059393269249:log-group:/growthcast/portal/staging/signing-provider:*'}]}
 p.legacy.request(['iam','put-role-policy'],{'RoleName':role,'PolicyName':'growthcast-staging-signing-provider-logs','PolicyDocument':json.dumps(policy)})
 save(R/'execution-log-policy.json',{'role':role,'policyName':'growthcast-staging-signing-provider-logs','policy':policy})
 if not (R/'stack.json').exists():
  result=p.legacy.request(['cloudformation','create-stack'],{'StackName':STACK,'TemplateBody':json.dumps(t)});save(R/'stack.json',result);print('Private signing service creation started',flush=True)
 for _ in range(120):
  s=aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
  if s['StackStatus']=='CREATE_COMPLETE':save(R/'deployment.json',{'at':p.legacy.c.now(),'outputs':{v['OutputKey']:v['OutputValue'] for v in s['Outputs']},'image':load(R/'image.json')['image'],'nativeRoutesPublic':False});print('Persistent private signing provider deployed',flush=True);return
  if 'FAILED' in s['StackStatus'] or 'ROLLBACK' in s['StackStatus']:raise RuntimeError('Private provider stack requires reconciliation')
  time.sleep(5)
 print('Private signing service still creating; resume deploy to poll',flush=True)

def verify():
 n=load(R/'network.json');d=load(R/'deployment.json')
 service=aws('ecs','describe-services','--cluster',n['Cluster'],'--services',d['outputs']['ServiceArn'])['services'][0]
 assert service['desiredCount']==service['runningCount']==1 and service['pendingCount']==0
 assert len(service['deployments'])==1 and service['deployments'][0]['rolloutState']=='COMPLETED'
 arns=aws('ecs','list-tasks','--cluster',n['Cluster'],'--service-name',service['serviceName'])['taskArns']
 tasks=aws('ecs','describe-tasks','--cluster',n['Cluster'],'--tasks',*arns)['tasks']
 assert len(tasks)==1 and tasks[0]['healthStatus']=='HEALTHY'
 assert tasks[0]['taskDefinitionArn']==d['outputs']['TaskDefinitionArn']
 sg=aws('ec2','describe-security-groups','--group-ids',d['outputs']['SecurityGroup'])['SecurityGroups'][0]
 assert len(sg['IpPermissions'])==1
 rule=sg['IpPermissions'][0]
 assert rule['FromPort']==rule['ToPort']==3000 and rule['IpProtocol']=='tcp'
 assert not rule['IpRanges'] and not rule['Ipv6Ranges']
 assert [v['GroupId'] for v in rule['UserIdGroupPairs']]==[n['ApiSecurityGroup']]
 instances=aws('servicediscovery','discover-instances','--namespace-name','signing.staging.growthcast.internal','--service-name','documenso','--health-status','HEALTHY')['Instances']
 assert len(instances)==1
 task_ips=[v['value'] for a in tasks[0]['attachments'] for v in a.get('details',[]) if v['name']=='privateIPv4Address']
 assert instances[0]['Attributes']['AWS_INSTANCE_IPV4'] in task_ips
 api=aws('ecs','describe-services','--cluster',n['Cluster'],'--services','growthcast-portal-staging-api')['services'][0]
 assert api['taskDefinition']==load(R/'before-api.json')['outputs']['TaskDefinitionArn']
 assert api['runningCount']==api['desiredCount'] and api['pendingCount']==0
 save(R/'verification.json',{'at':p.legacy.c.now(),'taskArn':tasks[0]['taskArn'],'taskDefinitionArn':tasks[0]['taskDefinitionArn'],'healthy':True,'databaseAndCertificateHealthy':True,'privateIngressVerified':True,'healthyDiscoveryMatchesTask':True,'portalApiTaskUnchanged':True,'portalSendingEnabled':False})
 print('Provider healthy; database, certificate and private ingress verified',flush=True)

if __name__=='__main__':{'build':build,'template':template,'enable-role':enable_role,'deploy':deploy,'verify':verify}[sys.argv[1]]()
