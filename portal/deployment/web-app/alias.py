"""Assign only the ready protected preview to its staging hostname."""
import importlib.util,json
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('h',R.parent/'proxy-secret/transfer.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
p=R/'deployment.json';d=json.loads(p.read_text());r=h.vercel('/v13/deployments/'+d['id'])
assert r['readyState']=='READY' and r.get('target') is None and r['projectId']==h.PROJECT
assert h.vercel('/v9/projects/'+h.PROJECT)['ssoProtection']['deploymentType']=='all'
a=h.vercel('/v2/deployments/'+d['id']+'/aliases','POST',{'alias':'clients.staging.growthcast.app'})
d.update(readyState='READY',alias=a['alias'],aliasId=a['uid'],protectedAllDeployments=True);p.write_text(json.dumps(d,indent=2)+'\n');print('Protected preview assigned to staging domain.')
