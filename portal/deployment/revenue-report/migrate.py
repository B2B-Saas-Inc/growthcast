"""Apply the reviewed additive migration with a short-lived migration-only login."""
import subprocess,tempfile,json,os,time
from pathlib import Path
R=Path(__file__).resolve().parent
config=Path.home()/'.config/growthcast/portal-staging'
os.umask(0o077)
with tempfile.TemporaryDirectory(prefix='growthcast-planning-migration-') as directory:
 (Path(directory)/'ca.crt').write_bytes((config/'prod-ca-2021.crt').read_bytes())
 common=['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(R.parent)+':/boundary/deployment:ro','-v',directory+':/private']
 def control(mode):
  r=subprocess.run(common+['-v',str(config/'database-url')+':/admin/database-url:ro','-v',str(config/'prod-ca-2021.crt')+':/admin/ca.crt:ro','growthcast-atrium-runtime','/boundary/deployment/revenue-report/migration-role.mjs',mode],capture_output=True,text=True)
  assert r.returncode==0,'Migration role control failed; diagnostics suppressed'
 try:
  control('enable')
  for attempt in range(18):
   r=subprocess.run(common+['-v',directory+':/run/secrets:ro','-e','SUPABASE_PROJECT_REF=saedetvoolpdysiyjwvg','growthcast-atrium-runtime','/boundary/deployment/supabase/managed-atrium/staging-migrate.mjs'],capture_output=True,text=True)
   if r.returncode==0 or '"28P01"' not in r.stderr: break
   time.sleep(5)
  if r.returncode:
   import urllib.parse
   raw=(Path(directory)/'database-url').read_text();parsed=urllib.parse.urlsplit(raw)
   diagnostic=r.stderr.replace(raw,'[connection withheld]').replace(urllib.parse.unquote(parsed.password or ''),'[password withheld]')
   print(diagnostic[-1800:])
   for line in r.stderr.splitlines():
    try:
     error=json.loads(line);print({k:error[k] for k in ['error','code'] if k in error})
    except (ValueError,TypeError):pass
  assert r.returncode==0,'Managed migration failed; diagnostics suppressed'
  record=json.loads(r.stdout);(R/'migration-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
 finally: control('disable')
print('Additive migration and repeated no-op passed. Migration login disabled.')
