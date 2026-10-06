"""Generate the isolated staging API network, HTTPS listener and service."""
import json
from pathlib import Path
R=Path(__file__).resolve().parent
ref=lambda x:{'Ref':x}
att=lambda x,k:{'Fn::GetAtt':[x,k]}
r={}
def add(name,kind,props,**extra):r[name]={'Type':'AWS::'+kind,'Properties':props,**extra}
add('Vpc','EC2::VPC',{'CidrBlock':'10.89.0.0/16','EnableDnsSupport':True,'EnableDnsHostnames':True})
add('Gateway','EC2::InternetGateway',{})
add('Attachment','EC2::VPCGatewayAttachment',{'VpcId':ref('Vpc'),'InternetGatewayId':ref('Gateway')})
add('Routes','EC2::RouteTable',{'VpcId':ref('Vpc')})
add('InternetRoute','EC2::Route',{'RouteTableId':ref('Routes'),'DestinationCidrBlock':'0.0.0.0/0','GatewayId':ref('Gateway')},DependsOn='Attachment')
for i,zone in enumerate(['us-east-1a','us-east-1b']):
 name='Subnet'+str(i)
 add(name,'EC2::Subnet',{'VpcId':ref('Vpc'),'CidrBlock':f'10.89.{i}.0/24','AvailabilityZone':zone,'MapPublicIpOnLaunch':False})
 add('RouteAssociation'+str(i),'EC2::SubnetRouteTableAssociation',{'SubnetId':ref(name),'RouteTableId':ref('Routes')})
add('ApiSecurityGroup','EC2::SecurityGroup',{'GroupDescription':'Staging API: ALB-only ingress; HTTPS and database TLS egress','VpcId':ref('Vpc'),'SecurityGroupEgress':[{'IpProtocol':'tcp','FromPort':p,'ToPort':p,'CidrIp':'0.0.0.0/0'} for p in [443,5432,465]]})
add('LoadBalancerSecurityGroup','EC2::SecurityGroup',{'GroupDescription':'Staging HTTPS listener only','VpcId':ref('Vpc'),'SecurityGroupIngress':[{'IpProtocol':'tcp','FromPort':443,'ToPort':443,'CidrIp':'0.0.0.0/0'}],'SecurityGroupEgress':[{'IpProtocol':'tcp','FromPort':3001,'ToPort':3001,'DestinationSecurityGroupId':ref('ApiSecurityGroup')}]})
add('ApiIngress','EC2::SecurityGroupIngress',{'GroupId':ref('ApiSecurityGroup'),'IpProtocol':'tcp','FromPort':3001,'ToPort':3001,'SourceSecurityGroupId':ref('LoadBalancerSecurityGroup')})
add('LoadBalancer','ElasticLoadBalancingV2::LoadBalancer',{'Type':'application','Scheme':'internet-facing','Subnets':[ref('Subnet0'),ref('Subnet1')],'SecurityGroups':[ref('LoadBalancerSecurityGroup')],'LoadBalancerAttributes':[{'Key':'routing.http.drop_invalid_header_fields.enabled','Value':'true'},{'Key':'routing.http.desync_mitigation_mode','Value':'strictest'}]},DependsOn='Attachment')
add('Target','ElasticLoadBalancingV2::TargetGroup',{'VpcId':ref('Vpc'),'Port':3001,'Protocol':'HTTP','TargetType':'ip','HealthCheckPath':'/api/health','Matcher':{'HttpCode':'403'},'HealthCheckIntervalSeconds':15,'HealthyThresholdCount':2,'TargetGroupAttributes':[{'Key':'deregistration_delay.timeout_seconds','Value':'30'}]})
cert=json.loads((R/'certificate.json').read_text());assert cert['status']=='ISSUED'
add('Listener','ElasticLoadBalancingV2::Listener',{'LoadBalancerArn':ref('LoadBalancer'),'Port':443,'Protocol':'HTTPS','SslPolicy':'ELBSecurityPolicy-TLS13-1-2-2021-06','Certificates':[{'CertificateArn':cert['certificateArn']}],'DefaultActions':[{'Type':'fixed-response','FixedResponseConfig':{'StatusCode':'404','ContentType':'text/plain','MessageBody':'Unavailable'}}]})
add('ApiRoute','ElasticLoadBalancingV2::ListenerRule',{'ListenerArn':ref('Listener'),'Priority':1,'Conditions':[{'Field':'host-header','Values':['api.clients.staging.growthcast.app']},{'Field':'path-pattern','Values':['/api/*']}],'Actions':[{'Type':'forward','TargetGroupArn':ref('Target')}]})
images=json.loads((R.parent/'cloud-account/package-images.json').read_text())
volumes=['delivered','origin','connections','storage','config','tmp']
container={'Name':'api','Image':images['atrium'],'Essential':True,'User':'1000:1000','ReadonlyRootFilesystem':True,'StopTimeout':30,'LinuxParameters':{'Capabilities':{'Drop':['ALL']},'InitProcessEnabled':True},'EntryPoint':['/usr/local/bin/bun'],'Command':['--input-type=module','-e',(R/'service.mjs').read_text()],'PortMappings':[{'ContainerPort':3001,'Protocol':'tcp'}],'MountPoints':[{'SourceVolume':n,'ContainerPath':'/tmp' if n=='tmp' else '/run/'+n,'ReadOnly':False} for n in volumes],'HealthCheck':{'Command':['CMD','/usr/local/bin/bun','-e',"const r=await fetch('http://127.0.0.1:3001/api/health');process.exit(r.status===200?0:1)"],'Interval':15,'Timeout':5,'Retries':3,'StartPeriod':60},'DependsOn':[{'ContainerName':'mail','Condition':'HEALTHY'}],'LogConfiguration':{'LogDriver':'awslogs','Options':{'awslogs-group':'/growthcast/portal/staging/backup','awslogs-region':'us-east-1','awslogs-stream-prefix':'staging-api'}}}
mail={'Name':'mail','Image':images['mail'],'Essential':True,'MemoryReservation':128,'HealthCheck':{'Command':['CMD-SHELL','wget -q -O - http://127.0.0.1:1080/healthz || exit 1'],'Interval':10,'Timeout':3,'Retries':5,'StartPeriod':10}}
add('Cluster','ECS::Cluster',{'ClusterName':'growthcast-portal-staging-api'})
add('Task','ECS::TaskDefinition',{'Family':'growthcast-portal-staging-api','Cpu':'512','Memory':'1024','NetworkMode':'awsvpc','RequiresCompatibilities':['FARGATE'],'RuntimePlatform':{'CpuArchitecture':'ARM64','OperatingSystemFamily':'LINUX'},'TaskRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-atrium-runtime','ExecutionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-execution','Volumes':[{'Name':n} for n in volumes],'ContainerDefinitions':[container,mail]})
add('Service','ECS::Service',{'ServiceName':'growthcast-portal-staging-api','Cluster':ref('Cluster'),'TaskDefinition':ref('Task'),'DesiredCount':1,'LaunchType':'FARGATE','PlatformVersion':'1.4.0','HealthCheckGracePeriodSeconds':120,'DeploymentConfiguration':{'DeploymentCircuitBreaker':{'Enable':True,'Rollback':True},'MaximumPercent':200,'MinimumHealthyPercent':100},'NetworkConfiguration':{'AwsvpcConfiguration':{'Subnets':[ref('Subnet0'),ref('Subnet1')],'SecurityGroups':[ref('ApiSecurityGroup')],'AssignPublicIp':'ENABLED'}},'LoadBalancers':[{'ContainerName':'api','ContainerPort':3001,'TargetGroupArn':ref('Target')}]},DependsOn=['ApiRoute','InternetRoute','ApiIngress','RouteAssociation0','RouteAssociation1'])
outputs={'LoadBalancerDns':att('LoadBalancer','DNSName'),'LoadBalancerArn':ref('LoadBalancer'),'ListenerArn':ref('Listener'),'TargetGroupArn':ref('Target'),'ClusterArn':att('Cluster','Arn'),'ServiceArn':ref('Service'),'TaskDefinitionArn':ref('Task'),'ApiSecurityGroup':ref('ApiSecurityGroup')}
t={'AWSTemplateFormatVersion':'2010-09-09','Description':'Isolated staging Atrium API with HTTPS-only ingress, private origin proof and Supabase database.','Resources':r,'Outputs':{k:{'Value':v} for k,v in outputs.items()}}
(R/'foundation.json').write_text(json.dumps(t,indent=2)+'\n')
print('Generated staging API template; no inline credentials.')
