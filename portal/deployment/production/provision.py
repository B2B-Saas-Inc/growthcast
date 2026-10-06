from common import *
import secrets
assert aws('sts','get-caller-identity')['Account']=='059393269249'
assert supa('/v1/organizations/'+ORG)['name']=='B2B SaaS Inc.'
if not (R/'database.json').exists():
 assert not any(p['name']=='growthcast-clients-production' for p in supa('/v1/projects')),'Reconcile existing project'
 password=secrets.token_urlsafe(48);(PRIVATE/'database-password').write_text(password)
 p=supa('/v1/projects',{'organization_slug':ORG,'name':'growthcast-clients-production','db_pass':password,'region_selection':{'type':'specific','code':'us-east-1'},'desired_instance_size':'micro'})
 save(R/'database.json',{'projectRef':p['id'],'name':p['name'],'organization':ORG,'status':p['status'],'createdAt':now()})
 print('Separate production Supabase project created.',flush=True)
if not (R/'certificate.json').exists():
 domain='api.clients.growthcast.app'
 assert not any(c['DomainName']==domain for c in aws('acm','list-certificates')['CertificateSummaryList'])
 c=aws('acm','request-certificate','--domain-name',domain,'--validation-method','DNS','--idempotency-token','gcProductionApi20260925','--tags','Key=Project,Value=growthcast-portal','Key=Environment,Value=production')
 save(R/'certificate.json',{'certificateArn':c['CertificateArn'],'domain':domain})
 print('Production API TLS certificate requested.',flush=True)
if not (R/'web-project.json').exists():
 assert not any(p['name']=='growthcast-clients' for p in vercel('/v9/projects?limit=100')['projects'])
 p=vercel('/v10/projects','POST',{'name':'growthcast-clients','framework':'nextjs','rootDirectory':'apps/web','publicSource':False,'ssoProtection':{'deploymentType':'all'}})
 save(R/'web-project.json',{'projectId':p['id'],'name':p['name'],'teamId':p['accountId'],'protectedUntilAcceptance':True})
 print('Separate production Vercel project created; protected until verification.',flush=True)
ref=load(R/'database.json')['projectRef']
for _ in range(100):
 p=supa('/v1/projects/'+ref)
 if p['status']=='ACTIVE_HEALTHY':break
 time.sleep(10)
else:raise RuntimeError('Project readiness pending')
r=load(R/'database.json');r['status']=p['status'];save(R/'database.json',r)
c=aws('acm','describe-certificate','--certificate-arn',load(R/'certificate.json')['certificateArn'])['Certificate'];r=load(R/'certificate.json');r.update(status=c['Status'],validation=c['DomainValidationOptions']);save(R/'certificate.json',r)
print('Production database ready; certificate DNS record recorded.',flush=True)
