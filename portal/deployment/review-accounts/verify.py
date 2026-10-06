"""Verify retained review logins and brand rendering; never print credentials."""
import sys,json,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
accounts=json.loads((Path.home()/'.config/growthcast/portal-staging/review-accounts.json').read_text())
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(50):
  if evaluate(js):return
  time.sleep(.5)
 raise AssertionError('Browser condition timed out')
def shot(name):ab('screenshot','/work/brand-'+name+'.png')
def logout():
 assert evaluate("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)")
 ab('open',WEB+'/login');wait('!!document.querySelector("#email")')
open_browser('/login');ab('set','viewport','1440','1000');wait('!!document.querySelector("#email")');evaluate('document.fonts.ready.then(()=>true)');shot('login')
brand=evaluate("({font:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,logoLoaded:document.querySelector('.gc-wordmark img').naturalWidth>0})")
assert 'Manrope' in brand['font'] and brand['logoLoaded']
for role,path in [('admin','/dashboard'),('client','/portal/projects')]:
 ab('fill','#email',accounts[role]['email']);ab('fill','#password',accounts[role]['password']);ab('click','button[type=submit]');wait('location.pathname==='+json.dumps(path));wait("document.body.innerText.includes('Your growth roadmap')")
 shot(role)
 if role=='admin':
  assert evaluate("fetch('/api/auth/update-user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'GrowthCast Admin'})}).then(r=>r.ok)")
  assert evaluate("document.body.innerText.includes('Internal planning')")
  logout()
 else:
  assert not evaluate("document.body.innerText.includes('Internal planning')")
  denied=evaluate('fetch('+json.dumps('/api/projects/mine/'+accounts['prefix']+'-internal')+').then(r=>r.status)');assert denied in [403,404]
  ab('open',WEB+'/portal/projects/'+accounts['prefix']+'-project');wait("document.body.innerText.includes('Review your growth priorities') || document.body.innerText.includes('Updates')");shot('project')
  ab('set','viewport','390','844');shot('client-mobile');assert evaluate('document.documentElement.scrollWidth<=innerWidth')
  logout()
shot('login-mobile');assert evaluate('document.documentElement.scrollWidth<=innerWidth')
evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'branding':brand,'adminLogin':True,'adminBothProjectsVisible':True,'clientLogin':True,'clientUnassignedProjectDenied':denied,'mobileNoHorizontalOverflow':True,'accountsRetained':True}
(R/'verification.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence))
