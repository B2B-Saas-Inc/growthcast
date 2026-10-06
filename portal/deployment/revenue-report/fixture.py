import json,subprocess,secrets,os,sys,shutil
from pathlib import Path
R=Path(__file__).resolve().parent
PRIVATE=Path('/tmp/growthcast-revenue-private')
mode=sys.argv[1]
if mode=='seed':
 os.umask(0o077);PRIVATE.mkdir(mode=0o700,exist_ok=False)
 d=json.loads((R.parent/'runtime-connections/deployment.json').read_text())
 result=subprocess.run(['aws','secretsmanager','get-secret-value','--secret-id',d['resources']['AtriumSecretArn'],'--version-id',d['versions']['atrium'],'--region','us-east-1','--output','json'],capture_output=True,text=True);assert result.returncode==0
 (PRIVATE/'connection.json').write_text(json.loads(result.stdout)['SecretString']);del result
 prefix='planning-'+secrets.token_hex(8)
 (PRIVATE/'fixture.json').write_text(json.dumps({'prefix':prefix,'password':secrets.token_hex(32)}))
 (R/'fixture-evidence.json').write_text(json.dumps({'prefix':prefix,'synthetic':True},indent=2)+'\n')
r=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(PRIVATE)+':/private','-v',str(R/'fixture.mjs')+':/fixture.mjs:ro','growthcast-atrium-runtime','/fixture.mjs',mode],capture_output=True,text=True)
assert r.returncode==0,'Planning fixture failed; details suppressed'
print(r.stdout.strip())
if mode=='cleanup':
 (R/'cleanup-evidence.json').write_text(r.stdout.strip()+'\n');shutil.rmtree(PRIVATE)
