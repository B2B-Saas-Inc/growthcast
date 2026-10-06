import json,sys,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
accounts=json.loads((Path.home()/'.config/growthcast/portal-staging/review-accounts.json').read_text())
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(50):
  try:
   if evaluate(js):return
  except RuntimeError:pass
  time.sleep(.4)
 raise AssertionError('Status control verification timed out')
open_browser('/login');ab('set','viewport','1440','1000');wait('!!document.querySelector("#email")');ab('fill','#email',accounts['admin']['email']);ab('fill','#password',accounts['admin']['password']);ab('click','button[type=submit]');wait('location.pathname==="/dashboard"')
statuses=evaluate('fetch("/api/projects/statuses").then(r=>r.json())');assert [s['slug'] for s in statuses]==['not_started','in_progress','in_review','completed']
projects=evaluate('fetch("/api/projects").then(r=>r.json()).then(r=>r.data.map(p=>({id:p.id,status:p.status})))');assert projects
ab('open',WEB+'/dashboard/projects/'+projects[0]['id']);wait('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="In Progress" && b.getClientRects().length>0 && !b.disabled)')
ab('screenshot','/work/status-desktop.png')
ab('set','viewport','390','844');ab('click','summary:not([aria-label])');wait('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="In Progress" && b.getClientRects().length>0 && !b.disabled)');ab('screenshot','/work/status-mobile.png')
assert evaluate('fetch("/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>r.ok)')
(R/'verification.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'statusOptionsAvailable':True,'desktopControlVisible':True,'mobileDetailsControlVisible':True,'projectStatusesChanged':False},indent=2)+'\n');print('Status choices visible on desktop and in mobile Details; no project status changed.')
