"""Browser helpers: scoped short-lived Vercel OIDC, no credentials in output."""
import json,subprocess
from pathlib import Path
NAME='growthcast-staging-ui-check'
WEB='https://clients.staging.growthcast.app'
def ab(*args):
 r=subprocess.run(['docker','exec',NAME,'agent-browser',*args],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('Browser command failed: '+args[0]+'; details suppressed')
 return r.stdout

def open_browser(path='/login'):
 token=subprocess.run(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','project','token','growthcast-clients-staging','--scope','b2b-saas'],capture_output=True,text=True)
 assert token.returncode==0,'Preview OIDC mint failed'
 value=token.stdout.strip();assert value.count('.')==2,'Expected short-lived OIDC token'
 output=ab('open',WEB+path,'--headers',json.dumps({'x-vercel-trusted-oidc-idp-token':value}))
 del value,token
 return output
if __name__=='__main__':
 print(open_browser());print(ab('snapshot','-i'))
