"""Exercise company profile creation and editing through the deployed client form."""
import json,sys,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads(Path('/tmp/growthcast-profile-private/fixture.json').read_text())
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(40):
  if evaluate(js):return
  time.sleep(.5)
 raise AssertionError('Profile browser condition failed')
mode=sys.argv[1]
if mode=='before':
 open_browser('/login');ab('fill','#email',f['email']);ab('fill','#password',f['password']);ab('click','button[type=submit]');wait("location.pathname==='/portal/projects'")
ab('open',WEB+'/portal/settings?check='+str(time.time_ns()));wait('document.querySelectorAll("form").length>=3')
if mode=='after':
 deployment=json.loads((R.parent/'web-app/deployment.json').read_text())['id']
 assert evaluate('[...document.scripts].some(s=>s.src.includes('+json.dumps('dpl='+deployment)+'))')
# Observe only the relevant save's status and bounded validation messages.
evaluate("window.__profileSave=null;const original=window.fetch;window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).endsWith('/clients/me/profile')&&args[1]?.method==='PUT'){window.__profileSave={status:r.status,body:await r.clone().json()}}return r}")
selector='form:has(textarea)'
for company in (['Profile regression test'] if mode=='before' else ['Profile regression test','Profile regression updated']):
 evaluate('window.__profileSave=null');ab('fill',selector+' > div:first-child input',company);ab('click',selector+' button[type=submit]');wait('window.__profileSave!==null')
 status=evaluate('window.__profileSave.status')
 if mode=='before':
  assert status==400
  messages=evaluate('window.__profileSave.body.message');assert any('userId' in x or 'organizationId' in x for x in messages)
  (R/'reproduction.json').write_text(json.dumps({'status':status,'validationMessages':messages},indent=2)+'\n');print('Reproduced HTTP 400: profile form resubmits protected identity fields.')
 else:
  assert status==200
  ab('reload');wait('!!document.querySelector("form textarea")')
  wait('document.querySelector("form:has(textarea) input").value==='+json.dumps(company))
  # Reload clears observation hook; install again for the existing-row edit.
  evaluate("window.__profileSave=null;const original=window.fetch;window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).endsWith('/clients/me/profile')&&args[1]?.method==='PUT'){window.__profileSave={status:r.status}}return r}")
if mode=='after':
 denied=evaluate("fetch('/api/clients/me/profile',{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token=')).split('=')[1]},body:JSON.stringify({company:'Forbidden override',organizationId:'other-org'})}).then(r=>r.status)")
 assert denied==400
 assert evaluate('fetch("/api/clients/me/profile").then(r=>r.json()).then(p=>p.company)')=='Profile regression updated'
 assert evaluate("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)")
 (R/'evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'firstCompanySave':True,'existingProfileEdit':True,'reloadPersistence':True,'identityOverrideStillRejected':denied,'reviewAccountUntouched':True},indent=2)+'\n');print('Company create/edit and reload persistence pass; identity overrides remain rejected.')
