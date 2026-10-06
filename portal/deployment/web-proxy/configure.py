"""Configure non-secret preview origins and attach the staging hostname only."""
import importlib.util,json
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('handoff',R.parent/'proxy-secret/transfer.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
p=h.vercel('/v9/projects/'+h.PROJECT)
assert p['accountId']==h.TEAM and p['name']=='growthcast-clients-staging' and p['ssoProtection']['deploymentType']=='all'
values={'PORTAL_WEB_URL':'https://clients.staging.growthcast.app','PORTAL_API_URL':'https://api.clients.staging.growthcast.app'}
for key,value in values.items():
 envs=h.vercel('/v10/projects/'+h.PROJECT+'/env')['envs'];existing=[x for x in envs if x['key']==key]
 if existing:
  assert len(existing)==1 and existing[0]['value']==value and existing[0]['target']==['preview']
 else:h.vercel('/v10/projects/'+h.PROJECT+'/env','POST',{'key':key,'value':value,'type':'plain','target':['preview']})
domain='clients.staging.growthcast.app'
domains=h.vercel('/v9/projects/'+h.PROJECT+'/domains')['domains']
if not any(x['name']==domain for x in domains):h.vercel('/v10/projects/'+h.PROJECT+'/domains','POST',{'name':domain})
assert h.vercel('/v9/projects/'+h.PROJECT)['ssoProtection']['deploymentType']=='all'
r=h.vercel('/v5/domains/'+domain+'/config')
(R/'configuration.json').write_text(json.dumps({'projectId':h.PROJECT,'teamId':h.TEAM,'previewOrigins':values,'domain':domain,'recommendedCNAME':r.get('recommendedCNAME'),'protection':'all'},indent=2)+'\n')
print('Non-secret preview origins and staging domain configured; project protection preserved.')
