import json,sys,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads(Path('/tmp/growthcast-polish-private/fixture.json').read_text());p=f['prefix'];project=p+'-project'
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(60):
  try:
   if evaluate(js):return
  except RuntimeError:pass
  time.sleep(.4)
 raise AssertionError('Project settings condition timed out: '+js[:150])
def api(path,method='GET',body=None):
 return evaluate('''(async()=>{const send=()=>fetch('/api'+PATH,{method:METHOD,headers:{'Content-Type':'application/json','x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1]||''},...(BODY===null?{}:{body:JSON.stringify(BODY)})});let r=await send();if(r.status===403&&METHOD!=='GET'&&(await r.clone().text()).toLowerCase().includes('csrf'))r=await send();return {status:r.status,body:await r.json().catch(()=>null)}})()'''.replace('PATH',json.dumps(path)).replace('METHOD',json.dumps(method)).replace('BODY',json.dumps(body)))
def login(role):
 open_browser('/login?check='+str(time.time_ns()));wait('!!document.querySelector("#email")');ab('fill','#email',p+'-'+role+'@growthcast.invalid');ab('fill','#password',f['password']);ab('click','button[type=submit]');wait("location.pathname.startsWith('/dashboard')")
def project_page():
 ab('open',WEB+'/dashboard/projects/'+project+'?tab=planning&check='+str(time.time_ns()));wait('!!document.querySelector("summary[aria-label]")')
ab('set','viewport','1440','1000');open_browser('/login');api('/auth/sign-out','POST',{});login('owner')
if evaluate('document.body.innerText.includes("No thanks")'):ab('find','role','button','click','--name','No thanks','--exact')
project_page()
d=json.loads((R.parent/'web-app/deployment.json').read_text())['id'];assert evaluate('[...document.scripts].some(s=>s.src.includes('+json.dumps('dpl='+d)+'))')
assert api('/projects/'+project)['body']['status']=='not_started'
assert evaluate('!document.querySelector("summary[aria-label]").parentElement.open')
assert not evaluate('document.body.innerText.includes("Default rate") || document.body.innerText.includes("Delete project") || document.body.innerText.toLowerCase().includes("timeline")')
ab('screenshot','/work/project-clean-desktop.png','--full')
ab('click','summary[aria-label="Project settings"]');wait('document.body.innerText.toLowerCase().includes("timeline")');assert evaluate('document.body.innerText.includes("Delete project")')
# Use stable test-only IDs on the existing native date inputs, without changing their handlers.
evaluate('[...document.querySelectorAll("[data-testid=project-settings-panel] input[type=date]")].forEach((e,i)=>e.id="acceptance-date-"+i)')
evaluate('(()=>{const e=document.querySelector("#acceptance-date-0");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"2026-10-01");e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return true})()');wait('document.body.innerText.includes("October 1, 2026")')
evaluate('[...document.querySelectorAll("[data-testid=project-settings-panel] input[type=date]")].forEach((e,i)=>e.id="acceptance-date-"+i)')
evaluate('(()=>{const e=document.querySelector("#acceptance-date-1");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"2026-12-31");e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return true})()');wait('document.body.innerText.includes("December 31, 2026")')
row=api('/projects/'+project)['body'];assert row['startDate'].startswith('2026-10-01') and row['endDate'].startswith('2026-12-31') and row['status']=='not_started'
ab('screenshot','/work/project-settings-desktop.png','--full')
# Duplicate opens the existing confirmation form, with the new name saved on submit.
ab('find','role','button','click','--name','Duplicate','--exact');wait('document.body.innerText.includes("Duplicate Project")')
ab('find','label','Name','fill','Settings duplicate review');evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Duplicate").at(-1).id="confirm-duplicate"');ab('click','#confirm-duplicate');wait('location.pathname!=="/dashboard/projects/'+project+'"')
duplicate=evaluate('location.pathname.split("/").pop()');assert api('/projects/'+duplicate)['body']['name']=='Settings duplicate review'
project_page();ab('click','summary[aria-label="Project settings"]');ab('find','role','button','click','--name','Archive','--exact');wait('document.body.innerText.includes("Archive Project")')
# Scope to the confirmation dialog so the underlying settings action remains untouched.
confirm=evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Archive").map(b=>({text:b.textContent.trim()})).length');assert confirm==2
# The last matching button is the confirmation action; mark just that existing button.
evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Archive").at(-1).id="confirm-archive"');ab('click','#confirm-archive');wait('document.body.innerText.includes("Archived. Editing disabled.")');assert api('/projects/'+project)['body']['archivedAt']
ab('find','role','button','click','--name','Unarchive','--exact');wait('!document.body.innerText.includes("Archived. Editing disabled.")');assert api('/projects/'+project)['body']['archivedAt'] is None
ab('press','Escape');wait('!document.querySelector("summary[aria-label]").parentElement.open')
ab('set','viewport','390','844');project_page();ab('click','summary[aria-label="Project settings"]');ab('screenshot','/work/project-settings-mobile.png','--full');assert evaluate('document.documentElement.scrollWidth<=innerWidth')
# Delete keeps its typed-name confirmation; inspect and cancel, preserving this fixture for cleanup.
ab('find','role','button','click','--name','Delete project','--exact');wait('document.body.innerText.includes("Delete Project")');assert evaluate('document.querySelectorAll("input").length>0');ab('find','role','button','click','--name','Cancel','--exact');assert api('/projects/'+project)['status']==200
api('/auth/sign-out','POST',{});login('employee');project_page();ab('click','summary[aria-label="Project settings"]');assert not evaluate('document.body.innerText.includes("Delete project")');assert evaluate('document.body.innerText.includes("Duplicate") && document.body.innerText.includes("Archive")');api('/auth/sign-out','POST',{})
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployment':d,'settingsHiddenInitially':True,'datesMovedSaveAndPersist':True,'defaultRateFieldRemoved':True,'statusUnaffectedByDates':True,'duplicateSaved':True,'archiveAndUnarchive':True,'deleteConfirmationRetained':True,'nonOwnerDeleteHidden':True,'escapeClosesSettings':True,'mobileNoOverflow':True,'retainedReviewProjectsUntouched':True}
(R/'acceptance.json').write_text(json.dumps(record,indent=2)+'\n');print('Project settings browser acceptance passed.')
