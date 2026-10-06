"""Live browser acceptance with disposable orgs and bounded authenticated API probes."""
import json,sys,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads(Path('/tmp/growthcast-planning-private/fixture.json').read_text());p=f['prefix']
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(60):
  try:
   if evaluate(js):return
  except RuntimeError:pass
  time.sleep(.4)
 raise AssertionError('Planning browser condition timed out: '+js[:140])
def api(path,method='GET',body=None):
 return evaluate('''(async()=>{const send=()=>fetch('/api'+PATH,{method:METHOD,headers:{'Content-Type':'application/json','x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1]||''},...(BODY===null?{}:{body:JSON.stringify(BODY)})});let r=await send();if(r.status===403&&METHOD!=='GET'&&(await r.clone().text()).toLowerCase().includes('csrf'))r=await send();return {status:r.status,body:await r.json().catch(()=>null)}})()'''.replace('PATH',json.dumps(path)).replace('METHOD',json.dumps(method)).replace('BODY',json.dumps(body)))
def login(role):
 open_browser('/login?check='+str(time.time_ns()));wait('!!document.querySelector("#email")');ab('fill','#email',p+'-'+role+'@growthcast.invalid');ab('fill','#password',f['password']);ab('click','button[type=submit]');wait("location.pathname.startsWith('/"+('portal' if role=='client' else 'dashboard')+"')")
def fill(label,value):ab('find','label',label,'fill',str(value))
ab('set','viewport','1440','1000');open_browser('/login');api('/auth/sign-out','POST',{});login('owner')
if evaluate('document.body.innerText.includes("No thanks")'):ab('find','role','button','click','--name','No thanks','--exact')
ab('open',WEB+'/dashboard/projects/'+p+'-project?tab=planning&check='+str(time.time_ns()));wait('document.body.innerText.includes("Save budget")')
deployment=json.loads((R.parent/'web-app/deployment.json').read_text())['id'];assert evaluate('[...document.scripts].some(s=>s.src.includes('+json.dumps('dpl='+deployment)+'))')
fill('Retainer ($/month)',4000);fill('Target billing rate ($/hour)',218);ab('find','role','button','click','--name','Save budget','--exact');wait('document.body.innerText.includes("Plan saved")')
ab('select','select[aria-label="Team member"]',p+'-employee-member');fill('Allocated hours/month',18.35);fill('Internal cost ($/hour)',109);ab('find','role','button','click','--name',('Update allocation' if evaluate('document.body.innerText.includes("Update allocation")') else 'Add to project'),'--exact');wait('document.body.innerText.includes("$1,635")')
data=api('/resource-planning/projects/'+p+'-project');assert data['status']==200
s=data['body']['summary'];a=data['body']['actual'];assert abs(s['includedHours']-4000/218)<1e-9 and s['expectedCostCents']==200000 and s['expectedMarginPercent']==50
assert a['actualHours']==15 and a['actualCostCents']==163500 and abs(a['actualMarginPercent']-59.125)<1e-8
ab('reload');wait('document.body.innerText.includes("$1,635")');ab('screenshot','/work/project-planning-desktop.png','--full')
assert api('/projects/'+p+'-second/unarchive','POST',{})['status']==201
assert api('/resource-planning/projects/'+p+'-second/staff/'+p+'-employee-member','PUT',{'allocatedMinutes':1200,'costRateCents':10900})['status']==200
ab('open',WEB+'/dashboard/reports/capacity');wait('document.body.innerText.includes("Review specialist")')
# Scope the repeated labels to the employee section.
section='section:nth-of-type(2)'
ab('fill',section+' label:nth-child(1) input','160');ab('fill',section+' label:nth-child(2) input','109');ab('click',section+' button');wait('document.body.innerText.includes("Member settings saved")')
c=api('/resource-planning/capacity');employee=next(m for m in c['body']['members'] if m['id']==p+'-employee-member')
assert abs(employee['allocatedHours']-38.35)<1e-8 and abs(employee['availableHours']-121.65)<1e-8 and employee['actualHours']==15
ab('screenshot','/work/team-capacity-desktop.png','--full')
# Over-capacity must remain visible, never clamped to zero.
assert api('/resource-planning/members/'+p+'-employee-member','PUT',{'capacityMinutes':600,'costRateCents':10900})['status']==200
ab('reload');wait('document.body.innerText.includes("Over capacity by 28.35 hours")')
assert api('/resource-planning/members/'+p+'-employee-member','PUT',{'capacityMinutes':9600,'costRateCents':10900})['status']==200
# Archive removes planned demand, while logged hours remain included.
assert api('/projects/'+p+'-second/archive','POST',{})['status']==201
c=api('/resource-planning/capacity');employee=next(m for m in c['body']['members'] if m['id']==p+'-employee-member');assert abs(employee['allocatedHours']-18.35)<1e-8
invalid=api('/resource-planning/projects/'+p+'-project/budget','PUT',{'retainerCents':400000,'targetRateCents':0});assert invalid['status']==400
foreign=api('/resource-planning/projects/'+p+'-foreign');assert foreign['status']==404
clientStaff=api('/resource-planning/projects/'+p+'-project/staff/'+p+'-client-member','PUT',{'allocatedMinutes':60,'costRateCents':100});assert clientStaff['status']==404
ab('set','viewport','390','844');ab('open',WEB+'/dashboard/projects/'+p+'-project?tab=planning');wait('document.body.innerText.includes("$1,635")');ab('screenshot','/work/project-planning-mobile.png','--full');assert evaluate('document.documentElement.scrollWidth<=window.innerWidth')
assert api('/auth/sign-out','POST',{})['status']==200
login('client')
for path,method,body in [('/resource-planning/capacity','GET',None),('/resource-planning/projects/'+p+'-project','GET',None),('/resource-planning/projects/'+p+'-project/budget','PUT',{'retainerCents':1,'targetRateCents':1}),('/resource-planning/members/'+p+'-employee-member','PUT',{'capacityMinutes':60,'costRateCents':1}),('/resource-planning/projects/'+p+'-project/staff/'+p+'-employee-member','DELETE',None)]:
 assert api(path,method,body)['status']==403
visible=api('/projects/mine/'+p+'-project');assert visible['status']==200
for key in ['retainerCents','targetRateCents','costRateCents','allocatedMinutes','capacityMinutes','project_budget','project_staff']:assert key not in json.dumps(visible['body'])
ab('open',WEB+'/portal/projects/'+p+'-project');wait('document.body.innerText.includes("Retainer review")');assert not evaluate('document.body.innerText.includes("Budget & team")');ab('screenshot','/work/client-project.png','--full')
assert api('/auth/sign-out','POST',{})['status']==200
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployment':deployment,'budgetSaveAndReload':True,'staffAssignment':True,'example':{'retainer':4000,'targetRate':218,'includedHours':s['includedHours'],'expectedCost':s['expectedCostCents']/100,'expectedMargin':50,'actualHours':15,'actualCost':1635,'actualMargin':a['actualMarginPercent']},'multiProjectCapacity':True,'overCapacityWarning':True,'archivedProjectExcluded':True,'zeroBillingRateRejected':True,'foreignProjectDenied':True,'clientCannotBeAssignedAsStaff':True,'clientReadWriteDenied':True,'clientPayloadExcludesPlanningFields':True,'mobileNoPageOverflow':True,'realEmailSent':False,'retainedReviewAccountsUntouched':True}
(R/'acceptance.json').write_text(json.dumps(record,indent=2)+'\n');print('Planning browser acceptance passed: budget, costs, margins, capacity, persistence, mobile and client isolation.')
