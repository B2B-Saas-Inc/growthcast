"""Exercise the existing-account UI with the disposable fixture."""
import json,time,subprocess,re
from pathlib import Path
from browser import ab,open_browser,NAME,WEB
from fixture import PRIVATE
f=json.loads((PRIVATE/'fixture.json').read_text())
(Path(__file__).resolve().parent/'download.txt').unlink(missing_ok=True)
def wait_for(expression):
 for _ in range(40):
  r=json.loads(ab('eval',expression,'--json'))
  if r['data']['result']:return
  time.sleep(.5)
 raise RuntimeError('Browser UI condition did not become true')
open_browser('/login')
ab('fill','#email',f['email']);ab('fill','#password',f['password']);ab('click','button[type=submit]');ab('wait','--url','**/portal/projects')
wait_for('document.body.innerText.includes("Browser acceptance project")')
ab('open',WEB+'/portal/projects/'+f['prefix']+'-project');wait_for('document.body.innerText.includes("Browser acceptance project")')
ab('find','text','Files','click')
subprocess.run(['docker','exec','-i',NAME,'sh','-c','cat > /tmp/browser-acceptance.txt'],input=b'Growthcast browser acceptance\nPrivate synthetic file.\n',check=True,capture_output=True)
ab('upload','input[type=file]','/tmp/browser-acceptance.txt');wait_for('document.body.innerText.includes("browser-acceptance.txt")')
snapshot=ab('snapshot','-i');ref=re.search(r'button "browser-acceptance.txt[^\n]*\[ref=(e\d+)\]',snapshot).group(1)
ab('download','@'+ref,'/work/download.txt')
print('Browser login, assigned project, file upload and UI download completed.')
