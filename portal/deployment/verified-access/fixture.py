"""Bounded local synthetic fixture driver; only restricted runtime credentials."""
import importlib.util,json,secrets,subprocess,os,sys
from pathlib import Path
R=Path(__file__).resolve().parent
PRIVATE=Path('/tmp/growthcast-verified-private')
def action(mode):
 r=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(PRIVATE)+':/private','-v',str(Path.home()/'.config/growthcast/portal-staging/backup-database-url')+':/audit/database-url:ro','-v',str(R/'fixture.mjs')+':/fixture.mjs:ro','growthcast-atrium-runtime','/fixture.mjs',mode],capture_output=True,text=True)
 assert r.returncode==0,'Browser fixture operation failed; inspect bounded source/state'
 print(r.stdout.strip())
if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='seed':
  os.umask(0o077);PRIVATE.mkdir(mode=0o700,exist_ok=False)
  s=importlib.util.spec_from_file_location('h',R.parent/'proxy-secret/transfer.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
  d=json.loads((R.parent/'runtime-connections/deployment.json').read_text());r=h.job.aws('secretsmanager','get-secret-value','--secret-id',d['resources']['AtriumSecretArn'],'--version-id',d['versions']['atrium'])
  (PRIVATE/'connection.json').write_text(r['SecretString']);del r
  prefix='browser-'+secrets.token_hex(8)
  (PRIVATE/'fixture.json').write_text(json.dumps({'prefix':prefix,'email':prefix+'@growthcast.invalid','password':secrets.token_hex(32)}))
  (R/'fixture-evidence.json').write_text(json.dumps({'prefix':prefix,'identity':'synthetic-preverified-user','emailVerificationTested':False},indent=2)+'\n')
 action(mode)
