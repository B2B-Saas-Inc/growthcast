"""Deploy the pinned frontend as a protected preview; never promote automatically."""
import importlib.util,json,subprocess,tempfile
from pathlib import Path
from prepare import prepare
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('handoff',R.parent/'proxy-secret/transfer.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
p=h.vercel('/v9/projects/'+h.PROJECT);assert p['ssoProtection']['deploymentType']=='all' and p['accountId']==h.TEAM
h.vercel('/v9/projects/'+h.PROJECT,'PATCH',{'rootDirectory':'apps/web','framework':'nextjs','buildCommand':None,'installCommand':None,'outputDirectory':None})
with tempfile.TemporaryDirectory(prefix='growthcast-frontend-') as d:
 root=Path(d);evidence=prepare(root)
 (root/'.vercel').mkdir();(root/'.vercel/project.json').write_text(json.dumps({'projectId':h.PROJECT,'orgId':h.TEAM}))
 auth=Path.home()/'Library/Application Support/com.vercel.cli'
 result=subprocess.run(['docker','run','--rm','-v',str(auth)+':/root/.local/share/com.vercel.cli','-v',str(root)+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','deploy','--yes','--scope','b2b-saas','--target','preview','--no-wait','--format','json'],capture_output=True,text=True)
 if result.returncode:print(result.stderr[-1800:]);raise SystemExit(1)
 response=json.loads(result.stdout);record={k:response.get(k) for k in ['id','url','readyState','target']};assert record['target'] is None
 (R/'source-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n');(R/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
