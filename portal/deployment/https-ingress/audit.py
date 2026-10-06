"""Read-only verification of the live HTTPS listener, service and role boundaries."""
import datetime,importlib.util,json,subprocess
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('deploy',R/'deploy.py');d=importlib.util.module_from_spec(s);s.loader.exec_module(d)
a=d.aws
o=json.loads((R/'deployment.json').read_text())['resources']
listeners=a('elbv2','describe-listeners','--load-balancer-arn',o['LoadBalancerArn'])['Listeners']
assert len(listeners)==1 and listeners[0]['Port']==443 and listeners[0]['Protocol']=='HTTPS'
assert listeners[0]['SslPolicy']=='ELBSecurityPolicy-TLS13-1-2-2021-06'
assert listeners[0]['Certificates'][0]['CertificateArn']==json.loads((R/'certificate.json').read_text())['certificateArn']
service=a('ecs','describe-services','--cluster',o['ClusterArn'],'--services',o['ServiceArn'])['services'][0]
assert service['desiredCount']==service['runningCount']==1 and service['pendingCount']==0
assert len(service['deployments'])==1 and service['deployments'][0]['rolloutState']=='COMPLETED'
ids=a('ecs','list-tasks','--cluster',o['ClusterArn'],'--service-name','growthcast-portal-staging-api')['taskArns']
tasks=a('ecs','describe-tasks','--cluster',o['ClusterArn'],'--tasks',*ids)['tasks']
assert len(tasks)==1 and tasks[0]['healthStatus']=='HEALTHY'
definition=a('ecs','describe-task-definition','--task-definition',o['TaskDefinitionArn'])['taskDefinition']
assert definition['taskRoleArn']=='arn:aws:iam::059393269249:role/growthcast-portal-staging-atrium-runtime'
api=next(c for c in definition['containerDefinitions'] if c['name']=='api')
assert api['image']==json.loads((R.parent/'cloud-account/package-images.json').read_text())['atrium']
assert api['readonlyRootFilesystem'] and api['user']=='1000:1000' and api['linuxParameters']['capabilities']['drop']==['ALL']
assert api['command']==['--input-type=module','-e',(R/'service.mjs').read_text()]
sg=a('ec2','describe-security-groups','--group-ids',o['ApiSecurityGroup'])['SecurityGroups'][0]
assert len(sg['IpPermissions'])==1
rule=sg['IpPermissions'][0];assert rule['FromPort']==rule['ToPort']==3001 and not rule['IpRanges'] and not rule['Ipv6Ranges'] and len(rule['UserIdGroupPairs'])==1
lb=a('elbv2','describe-load-balancers','--load-balancer-arns',o['LoadBalancerArn'])['LoadBalancers'][0]
assert rule['UserIdGroupPairs'][0]['GroupId'] in lb['SecurityGroups']
health=a('elbv2','describe-target-health','--target-group-arn',o['TargetGroupArn'])['TargetHealthDescriptions']
assert len(health)==1 and health[0]['TargetHealth']['State']=='healthy'
source=Path.home()/'.config/growthcast/portal-staging'
r=subprocess.run(['docker','run','--rm','--entrypoint','node','-v',str(R.parent)+':/app/deployment:ro','-v',str(source)+':/source:ro','growthcast-supabase-preflight','/app/deployment/https-ingress/roles.mjs'],capture_output=True)
assert r.returncode==0,'Database role audit failed'
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','httpsOnly':True,'apiIngressOnlyFromLoadBalancer':True,'healthyTasks':ids,'targetHealthy':True,'runtimeRoleAndImageVerified':True,'databaseRoles':json.loads(r.stdout),'listenerArn':listeners[0]['ListenerArn'],'pdfSigningCertificate':False}
(R/'audit-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('HTTPS listener, healthy service, pinned runtime and restricted database roles verified.')
