"""Deploy only an allowlisted proxy package to the existing protected preview project."""
import json,os,subprocess,tempfile,shutil
from pathlib import Path
R=Path(__file__).resolve().parent
assert (R/'lib/vercel-api-proxy.mjs').read_bytes()==(R.parent/'vercel-api-proxy.mjs').read_bytes()
assert (R/'lib/runtime.mjs').read_text()==(R.parent/'proxy-secret/runtime.mjs').read_text().replace("'../vercel-api-proxy.mjs'","'./vercel-api-proxy.mjs'")
with tempfile.TemporaryDirectory(prefix='growthcast-web-deploy-') as d:
 p=Path(d)
 for name in ['package.json','package-lock.json','next.config.mjs','vercel.json']:
  shutil.copyfile(R/name,p/name)
 for name in ['app','lib']:shutil.copytree(R/name,p/name)
 (p/'.vercel').mkdir();(p/'.vercel/project.json').write_text(json.dumps({'projectId':'prj_CMSykF9Wbj5YNwQAgl1lANn5tX3w','orgId':'team_rPWWEtg8Y7oXBuA7rUHohbU1'}))
 auth=Path.home()/'Library/Application Support/com.vercel.cli'
 result=subprocess.run(['docker','run','--rm','-v',str(auth)+':/root/.local/share/com.vercel.cli','-v',str(p)+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','deploy','--yes','--scope','b2b-saas','--target','preview','--no-wait','--format','json'],capture_output=True,text=True)
 if result.returncode:
  print('Deployment command failed; bounded CLI diagnostic: '+result.stderr[-1500:]);raise SystemExit(1)
 try:response=json.loads(result.stdout)
 except ValueError:
  print('Unexpected deployment response; manual reconciliation required');raise SystemExit(1)
 record={k:response[k] for k in ['id','url','name','readyState','target','projectId'] if k in response}
 (R/'deployment.json').write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps(record))
