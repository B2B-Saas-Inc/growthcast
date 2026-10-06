import json,subprocess,tempfile,os,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
os.umask(0o077)
def secret(arn,version):
 r=subprocess.run(['aws','secretsmanager','get-secret-value','--secret-id',arn,'--version-id',version,'--region','us-east-1'],capture_output=True,text=True);assert r.returncode==0,'Secret read failed';return json.loads(r.stdout)['SecretString']
pins=json.loads((R.parent/'runtime-secrets/runtime-pins.json').read_text())['atrium'];conn=json.loads((R.parent/'runtime-connections/deployment.json').read_text())
with tempfile.TemporaryDirectory(prefix='growthcast-smtp-check-') as directory:
 p=Path(directory);(p/'runtime.json').write_text(secret(pins['arn'],pins['version']));(p/'connection.json').write_text(secret(conn['resources']['AtriumSecretArn'],conn['versions']['atrium']))
 r=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(p)+':/private:ro','-v',str(R/'auth-check.mjs')+':/check.mjs:ro','growthcast-atrium-runtime','/check.mjs'],capture_output=True,text=True)
 assert r.stdout.strip(),'Authentication check failed before bounded result'
 result=json.loads(r.stdout);result['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(R/'authentication-evidence.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));assert r.returncode==0,'SMTP authentication did not pass'
