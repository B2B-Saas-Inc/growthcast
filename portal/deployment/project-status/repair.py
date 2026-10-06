import json,subprocess,tempfile,os
from pathlib import Path
R=Path(__file__).resolve().parent
os.umask(0o077)
d=json.loads((R.parent/'runtime-connections/deployment.json').read_text())
with tempfile.TemporaryDirectory(prefix='growthcast-status-repair-') as directory:
 r=subprocess.run(['aws','secretsmanager','get-secret-value','--secret-id',d['resources']['AtriumSecretArn'],'--version-id',d['versions']['atrium'],'--region','us-east-1','--output','json'],capture_output=True,text=True);assert r.returncode==0
 (Path(directory)/'connection.json').write_text(json.loads(r.stdout)['SecretString']);del r
 r=subprocess.run(['docker','run','--rm','--entrypoint','/usr/local/bin/bun','-v',str(R)+':/work:ro','-v',directory+':/private:ro','growthcast-atrium-runtime','/work/repair.mjs'],capture_output=True,text=True);assert r.returncode==0,'Scoped status repair failed'
 (R/'repair-evidence.json').write_text(r.stdout);print(r.stdout.strip())
