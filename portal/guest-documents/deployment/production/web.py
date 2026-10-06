"""Production frontend prepared with production environment; alias only after backend acceptance."""
from pathlib import Path
import sys,tempfile,json,importlib.util
import release as r
p=r.legacy;OUT=r.R/'release/production'
sys.path.insert(0,str(r.P/'deployment/web-app'))
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
if sys.argv[1]=='prepare':
 path=OUT/'web.json'
 if path.exists():
  d=p.load(path);d['readyState']=p.c.vercel('/v13/deployments/'+d['id'])['readyState'];p.save(path,d);print('Production frontend '+d['readyState']);raise SystemExit()
 builder=module('web_prepare',r.P/'deployment/web-app/prepare.py');ui=module('guest_ui',r.P/'guest-documents/web/prepare.py')
 with tempfile.TemporaryDirectory(prefix='gc-production-documents-web-') as td:
  root=Path(td);source=builder.prepare(root);ui.apply(root/'apps/web');p.save(root/'.vercel/project.json',{'projectId':p.CONFIG['production']['project'],'orgId':p.c.v.TEAM})
  result=p.checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','-v',td+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','deploy','--yes','--scope','b2b-saas','--prod','--skip-domain','--no-wait','--format','json'])
  d=json.loads(result);p.save(path,{k:d.get(k) for k in ['id','url','readyState','target']});p.save(OUT/'web-source.json',source)
 print('Production frontend submitted; current live alias preserved')
elif sys.argv[1]=='alias':
 assert (OUT/'backend-accepted.json').exists()
 d=p.load(OUT/'web.json');assert p.c.vercel('/v13/deployments/'+d['id'])['readyState']=='READY'
 p.c.vercel('/v2/deployments/'+d['id']+'/aliases',method='POST',body={'alias':p.CONFIG['production']['host']});p.save(OUT/'alias.json',{'deployment':d['id'],'at':p.c.now(),'host':p.CONFIG['production']['host']})
 print('Production frontend alias updated')
else:raise ValueError('Unknown operation')
