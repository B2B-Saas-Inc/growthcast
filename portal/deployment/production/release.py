"""Open only the canonical production domain after acceptance; retain preview protection."""
from common import *
assert load(R/'audit-evidence.json')['healthyIndependentApi']
assert load(R/'release-recovery-result.json')['status']=='SUCCEEDED'
assert load(R/'stripe-verification.json')['signatureAccepted']
assert load(R/'migration-evidence.json')['allBusinessRecordsMatchCurrentStaging']
p=load(R/'web-project.json')['projectId']
r=vercel('/v9/projects/'+p,'PATCH',{'ssoProtection':{'deploymentType':'prod_deployment_urls_and_all_previews'}})
assert r['ssoProtection']['deploymentType']=='prod_deployment_urls_and_all_previews'
bypass=PRIVATE/'vercel-bypass'
if bypass.exists():
 vercel('/v1/projects/'+p+'/protection-bypass','PATCH',{'revoke':{'secret':bypass.read_text(),'regenerate':False}})
 bypass.unlink()
r=vercel('/v9/projects/'+p);assert not r.get('protectionBypass')
save(R/'release.json',{'releasedAt':now(),'domain':'https://clients.growthcast.app','projectId':p,'ssoProtection':r['ssoProtection'],'temporaryBypassRevoked':True,'stagingUnchanged':True})
print('Canonical production domain released; generated deployments and staging remain protected.')
