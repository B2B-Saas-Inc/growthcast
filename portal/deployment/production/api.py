from common import *
import copy
f=load(R/'foundation-resources.json');images=load(R/'images.json');ref=load(R/'database.json')['projectRef'];cert=load(R/'certificate.json')
c=aws('acm','describe-certificate','--certificate-arn',cert['certificateArn'])['Certificate'];assert c['Status']=='ISSUED'
t=load(D/'https-ingress/foundation.json')
s=json.dumps(t).replace('growthcast-portal-staging-api','growthcast-portal-production-api').replace('api.clients.staging.growthcast.app','api.clients.growthcast.app').replace('clients.staging.growthcast.app','clients.growthcast.app').replace(SOURCE,ref).replace('10.89.','10.90.')
t=json.loads(s);r=t['Resources'];t['Description']='Independent GrowthCast Phase 2 production API'
r['Listener']['Properties']['Certificates']=[{'CertificateArn':cert['certificateArn']}]
p=r['Task']['Properties'];p['TaskRoleArn']=f['RuntimeRoleArn'];p['ExecutionRoleArn']=f['ExecutionRoleArn']
api=p['ContainerDefinitions'][0];api['Image']=images['api'];api['LogConfiguration']['Options']['awslogs-group']=f['LogGroup'];api['LogConfiguration']['Options']['awslogs-stream-prefix']='production-api'
# No public portal before migration and account acceptance; health requires the private origin proof.
save(R/'api-foundation.json',t)
if not (R/'api-resources.json').exists():
 query(ref,'ALTER ROLE gc_app LOGIN',False)
 try:resources=a.create_stack('growthcast-portal-production-api',t)
 except Exception:
  query(ref,'ALTER ROLE gc_app NOLOGIN',False);raise
 save(R/'api-resources.json',resources);print('Production API service created; public frontend remains protected.',flush=True)
