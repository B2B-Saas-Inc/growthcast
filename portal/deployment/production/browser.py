"""Browser helpers: scoped temporary Vercel automation bypass, no credentials in output."""
import json,subprocess
from pathlib import Path
NAME='growthcast-production-ui-check'
WEB='https://clients.growthcast.app'
def ab(*args):
 r=subprocess.run(['docker','exec',NAME,'agent-browser',*args],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('Browser command failed: '+args[0]+'; details suppressed')
 return r.stdout

def open_browser(path='/login'):
 value=(Path.home()/'.config/growthcast/portal-production/vercel-bypass').read_text()
 return ab('open',WEB+path,'--headers',json.dumps({'x-vercel-protection-bypass':value}))
