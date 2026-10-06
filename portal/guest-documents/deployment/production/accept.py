"""Check exact production runtime, routing, recovery and preserved account records."""
import sys,json,hashlib
from urllib.request import urlopen
from urllib.error import HTTPError
import provider as q
p=q.p;OUT=q.OUT

def backend():
 for name in ['package-checks.json','provider-verified.json','documents-verified.json']:assert (OUT/name).exists(),name
 assert p.load(OUT/'signing-escrow/escrow-evidence.json')['exactProductionVersionsRecovered']==10
 receipts={}
 for stack in ['growthcast-portal-production-api','growthcast-portal-production-signing-provider','growthcast-portal-production-signing-services']:
  receipts[stack]=q.outputs(stack)
 images=p.load(OUT/'images.json');services={}
 for service in ['growthcast-portal-production-api','growthcast-portal-production-signing-provider','growthcast-portal-production-signing-gateway','growthcast-portal-production-signing-lifecycle']:
  s=p.aws('ecs','describe-services','--cluster','growthcast-portal-production-api','--services',service)['services'][0]
  assert s['runningCount']==s['desiredCount']==1 and s['pendingCount']==0 and len(s['deployments'])==1 and s['deployments'][0]['rolloutState']=='COMPLETED',service
  arns=p.aws('ecs','list-tasks','--cluster','growthcast-portal-production-api','--service-name',service)['taskArns'];tasks=p.aws('ecs','describe-tasks','--cluster','growthcast-portal-production-api','--tasks',*arns)['tasks'];assert len(tasks)==1 and tasks[0]['healthStatus']=='HEALTHY'
  definition=p.aws('ecs','describe-task-definition','--task-definition',s['taskDefinition'])['taskDefinition']
  for c in definition['containerDefinitions']:
   if c['name'] in ['api','guest']:assert c['image']==images[c['name']]
   if c['name'] in ['gateway','lifecycle']:assert c['image']==images['guest']
   if c['name']=='provider':assert c['image']==p.load(OUT/'provider-image.json')['image']
  services[service]={'taskDefinition':s['taskDefinition'],'healthy':True}
 for key in ['TargetGroupArn','GuestTargetGroupArn']:
  checks=p.aws('elbv2','describe-target-health','--target-group-arn',receipts['growthcast-portal-production-api'][key])['TargetHealthDescriptions'];assert checks and all(c['TargetHealth']['State']=='healthy' for c in checks)
 paths={}
 for path,expected in [('/unlock',200),('/growthcast-favicon-v2.jpg',200),('/api/guest/staff/catalog',404),('/api/v2/envelope',(403,404)),('/sign/invalid',(403,404))]:
  try:
   with urlopen('https://api.clients.growthcast.app'+path,timeout=20) as response:status=response.status;data=response.read()
  except HTTPError as error:status=error.code;data=error.read()
  assert status in (expected if isinstance(expected,tuple) else (expected,)),(path,status)
  if path.endswith('.jpg'):assert hashlib.sha256(data).digest()==hashlib.sha256((q.P/'deployment/web-app/brand/growthcast-favicon-v2.jpg').read_bytes()).digest()
  paths[path]=status
 p.save(OUT/'backend-accepted.json',{'at':p.c.now(),'services':services,'paths':paths,'schema':13,'independentRecovery':'VERIFIED','signingSecretsRecovered':10});print('Production backend, isolation, icons and independent recovery accepted')
def finish():
 for name in ['backend-accepted.json','alias.json','browser.json','fixture-cleanup.json','schedule-restored.json']:assert (OUT/name).exists(),name
 sql="SELECT count(*)::int AS accounts,md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY id),'')) AS digest FROM gc_atrium.account a"
 rows=p.c.supa('/v1/projects/mdjldxussxdtcjxsoesr/database/query',{'query':sql,'read_only':True});assert rows==p.load(OUT/'accounts-before.json')['check'],'Existing account records changed'
 d=p.load(OUT/'web.json');aliases=p.c.vercel('/v4/aliases/clients.growthcast.app');assert aliases['deploymentId']==d['id']
 q.p.save(OUT/'acceptance.json',{'at':p.c.now(),'environment':'production','url':'https://clients.growthcast.app','schema':13,'deployment':d['id'],'accountsAndPasswordHashesUnchanged':True,'browserChecks':p.load(OUT/'browser.json')['passed'],'backendVerified':True,'dataRecovery':'VERIFIED','secretVersionsRecovered':10,'recoveryCadence':p.load(OUT/'schedule-restored.json')['cadence'],'stagingChanged':False,'liveTestEmailsSent':0,'signingCertificate':'independent self-signed GrowthCast identity','singleRecipientDeliveryEnabled':True,'productionSigningTestPerformed':False})
 print('Production documents release accepted; accounts preserved and recovery scheduled')
if __name__=='__main__':{'backend':backend,'finish':finish}[sys.argv[1]]()
