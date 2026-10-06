from common import *
import sys,tempfile
sys.path.insert(0,str(D/'web-app'))
from prepare import prepare
p=load(R/'web-project.json');id=p['projectId'];assert id!=v.PROJECT
project=vercel('/v9/projects/'+id);assert project['name']=='growthcast-clients' and project['ssoProtection']['deploymentType']=='all'
if not (R/'web-env.json').exists():
 assert not vercel('/v10/projects/'+id+'/env')['envs']
 material=load(PRIVATE/'identity.json')['runtime']['secrets']
 for key,val,kind in [('PORTAL_WEB_URL','https://clients.growthcast.app','plain'),('PORTAL_API_URL','https://api.clients.growthcast.app','plain'),('PORTAL_API_ORIGIN_PROOF',material['PORTAL_API_ORIGIN'],'sensitive')]:
  vercel('/v10/projects/'+id+'/env','POST',{'key':key,'value':val,'type':kind,'target':['production']})
 save(R/'web-env.json',{'projectId':id,'productionOnly':True,'independentOriginProof':True,'keys':['PORTAL_WEB_URL','PORTAL_API_URL','PORTAL_API_ORIGIN_PROOF']})
if not (R/'web-domain.json').exists():
 d=vercel('/v10/projects/'+id+'/domains','POST',{'name':'clients.growthcast.app'});save(R/'web-domain.json',d)
 config=vercel('/v6/domains/clients.growthcast.app/config');save(R/'web-domain-config.json',config)
if not (R/'web-deployment.json').exists():
 with tempfile.TemporaryDirectory(prefix='growthcast-production-web-') as td:
  root=Path(td);evidence=prepare(root);(root/'.vercel').mkdir();save(root/'.vercel/project.json',{'projectId':id,'orgId':p['teamId']})
  auth=Path.home()/'Library/Application Support/com.vercel.cli'
  r=checked(['docker','run','--rm','-v',str(auth)+':/root/.local/share/com.vercel.cli','-v',str(root)+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','deploy','--yes','--scope','b2b-saas','--prod','--no-wait','--format','json'])
  r=json.loads(r);save(R/'web-deployment.json',{k:r.get(k) for k in ['id','url','readyState','target']});save(R/'web-source.json',evidence);print('Production frontend build submitted; Vercel access protection retained.',flush=True)
