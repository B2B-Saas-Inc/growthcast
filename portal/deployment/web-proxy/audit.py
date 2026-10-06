"""Read-only audit of the preview alias, protection, and narrow environment scope."""
import datetime,importlib.util,json
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('h',R.parent/'proxy-secret/transfer.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
d=json.loads((R/'deployment.json').read_text())
p=h.vercel('/v9/projects/'+h.PROJECT);assert p['accountId']==h.TEAM and p['ssoProtection']['deploymentType']=='all'
live=h.vercel('/v13/deployments/'+d['id']);assert live['readyState']=='READY' and live.get('target') is None and live['projectId']==h.PROJECT
aliases=h.vercel('/v2/deployments/'+d['id']+'/aliases')['aliases'];assert any(a['alias']=='clients.staging.growthcast.app' for a in aliases)
envs=h.vercel('/v10/projects/'+h.PROJECT+'/env')['envs'];assert {x['key'] for x in envs}=={'PORTAL_WEB_URL','PORTAL_API_URL','PORTAL_API_ORIGIN_PROOF'}
for x in envs:
 assert x['target']==['preview']
 if x['key']=='PORTAL_API_ORIGIN_PROOF':assert x['type']=='sensitive'
 else:assert x['type']=='plain' and x['value']=={'PORTAL_WEB_URL':'https://clients.staging.growthcast.app','PORTAL_API_URL':'https://api.clients.staging.growthcast.app'}[x['key']]
r={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','deploymentId':d['id'],'target':'preview','allDeploymentProtection':True,'canonicalAliasAssigned':True,'environment':[{'key':x['key'],'type':x['type'],'target':x['target']} for x in envs]}
(R/'audit-evidence.json').write_text(json.dumps(r,indent=2)+'\n');print('Preview, canonical alias, all-deployment protection and exact three-variable environment verified.')
