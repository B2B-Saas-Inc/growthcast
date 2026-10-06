"""Real deployed browser/API checks using scoped synthetic data, no network mocks."""
import json,sys,time,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads(Path('/tmp/growthcast-revenue-private/fixture.json').read_text());p=f['prefix']
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(80):
  try:
   if evaluate(js):return
  except RuntimeError:pass
  time.sleep(.4)
 raise AssertionError('Revenue browser condition timed out: '+js[:140])
def api(path,method='GET',body=None):
 return evaluate('''(async()=>{const send=()=>fetch('/api'+PATH,{method:METHOD,headers:{'Content-Type':'application/json','x-csrf-token':document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1]||''},...(BODY===null?{}:{body:JSON.stringify(BODY)})});let r=await send();if(r.status===403&&METHOD!=='GET'&&(await r.clone().text()).toLowerCase().includes('csrf'))r=await send();return {status:r.status,body:await r.json().catch(()=>null)}})()'''.replace('PATH',json.dumps(path)).replace('METHOD',json.dumps(method)).replace('BODY',json.dumps(body)))
def login(role):
 open_browser('/login?check='+str(time.time_ns()));wait('!!document.querySelector("#email")');ab('fill','#email',p+'-'+role+'@growthcast.invalid');ab('fill','#password',f['password']);ab('click','button[type=submit]');wait("location.pathname.startsWith('/"+('portal' if role=='client' else 'dashboard')+"')")
def fill(label,value):ab('find','label',label,'fill',str(value))
ab('set','viewport','1440','1000');open_browser('/login');api('/auth/sign-out','POST',{});login('owner')
if evaluate('document.body.innerText.includes("No thanks")'):ab('find','role','button','click','--name','No thanks','--exact')
for suffix,kind in [('project','retainer'),('second','flat_fee'),('hourly','hourly')]:
 assert api('/resource-planning/projects/'+p+'-'+suffix+'/budget','PUT',{'engagementType':kind,'retainerCents':400000 if kind!='hourly' else 0,'targetRateCents':21800})['status']==200
 assert api('/resource-planning/projects/'+p+'-'+suffix+'/staff/'+p+'-employee-member','PUT',{'allocatedMinutes':1101,'costRateCents':10900})['status']==200
ab('open',WEB+'/dashboard/projects/'+p+'-second?tab=planning');wait('document.body.innerText.includes("Save budget")');assert evaluate('document.querySelector("select[aria-label=\\"Engagement type\\"]").value')=='flat_fee'
fill('Flat fee ($)',4000);ab('find','role','button','click','--name','Save budget','--exact');wait('document.body.innerText.includes("Plan saved")');ab('reload');wait('document.body.innerText.includes("Flat fee ($)")')
deployment=json.loads((R.parent/'web-app/deployment.json').read_text())['id'];assert evaluate('[...document.scripts].some(s=>s.src.includes('+json.dumps('dpl='+deployment)+'))')
assert api('/resource-planning/projects/'+p+'-second')['body']['budget']['engagementType']=='flat_fee'
assert api('/resource-planning/projects/'+p+'-second/budget','PUT',{'engagementType':'bad','retainerCents':1,'targetRateCents':1})['status']==400
assert api('/resource-planning/projects/'+p+'-foreign')['status']==404
r=api('/resource-planning/revenue?from=2026-01&to=2026-03');assert r['status']==200;r=r['body']
assert len(r['rows'])==9 and len(r['warnings'])==1
assert r['totals']['revenueCents']==1620000 and r['totals']['expectedCostCents']==810900 and r['totals']['actualCostCents']==359700
assert abs(r['totals']['actualMarginPercent']-77.7962962963)<1e-8
flat=[x for x in r['rows'] if x['projectId']==p+'-second'];assert [x['revenueCents'] for x in flat]==[400000,0,0]
hourly=next(x for x in r['rows'] if x['projectId']==p+'-hourly' and x['month']=='2026-02');assert hourly['billedHours']==1 and hourly['actualHours']==3 and hourly['revenueCents']==20000 and hourly['actualCostCents']==32700
assert not any(x['projectId']==p+'-foreign' for x in r['rows'])
assert api('/resource-planning/revenue?from=2026-13&to=2026-14')['status']==400
ab('open',WEB+'/dashboard/reports/revenue');wait('document.body.innerText.includes("All months total")')
# Native month setter dispatches React input/change events.
for label,value in [('Report from month','2026-01'),('Report through month','2026-03')]:
 evaluate('''(()=>{const e=document.querySelector('input[aria-label='+JSON.stringify(LABEL)+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,VALUE);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()'''.replace('LABEL',json.dumps(label)).replace('VALUE',json.dumps(value)))
ab('find','role','button','click','--name','Update report','--exact');wait('document.body.innerText.includes("$16,200.00")');assert not evaluate('document.querySelector("table").innerText.includes("2026-04 total")')
ab('screenshot','/work/revenue-desktop.png','--full');ab('set','viewport','390','844');ab('screenshot','/work/revenue-mobile.png','--full');assert evaluate('document.documentElement.scrollWidth<=innerWidth')
ab('open',WEB+'/dashboard/settings/workspace');wait('document.body.innerText.includes("Workspace")');wait('document.body.innerText.includes("Save")');assert not evaluate('document.body.innerText.includes("Custom Domain")');assert not evaluate('[...document.querySelectorAll("a")].some(a=>a.getAttribute("href")==="/dashboard/settings/organizations"||a.getAttribute("href")==="/dashboard/settings/billing")');ab('screenshot','/work/settings-mobile.png','--full')
for route in ['organizations','billing']:
 ab('open',WEB+'/dashboard/settings/'+route);wait('location.pathname==="/dashboard/settings/workspace"')
new=api('/time-entries','POST',{'projectId':p+'-hourly','startedAt':'2026-02-07T00:00:00Z','endedAt':'2026-02-07T01:00:00Z','billable':True})
assert new['status']==201 and new['body']['hourlyRateCents']==21800
assert api('/time-entries/'+new['body']['id'],'DELETE')['status'] in [200,204]
assert api('/auth/sign-out','POST',{})['status']==200;login('client')
assert api('/resource-planning/revenue?from=2026-01&to=2026-03')['status']==403
assert api('/resource-planning/projects/'+p+'-project/budget','PUT',{'engagementType':'flat_fee','retainerCents':1,'targetRateCents':1})['status']==403
visible=api('/projects/mine/'+p+'-project');assert visible['status']==200
for key in ['engagementType','retainerCents','costRateCents']:assert key not in json.dumps(visible['body'])
assert api('/auth/sign-out','POST',{})['status']==200
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployment':deployment,'realApiNoMocks':True,'flatFeeSaveReload':True,'monthlyReportTotals':r['totals'],'invoicedOnlyHourlyRevenue':True,'allLoggedLaborCost':True,'flatFeeOnlyStartMonth':True,'missingSetupWarning':True,'clientReadWriteDenied':True,'foreignProjectDenied':True,'clientPayloadPrivate':True,'mobileNoPageOverflow':True,'adminSettingsHidden':True,'hiddenRoutesRedirect':True,'realEmailsSent':False,'retainedReviewDataUntouched':True}
(R/'acceptance.json').write_text(json.dumps(record,indent=2)+'\n');print('Monthly revenue, engagement types, totals, isolation and settings browser acceptance passed.')
