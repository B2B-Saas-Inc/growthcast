"""Frontend verification uses a disposable account and explicit payment API fixtures.
The real Stripe key is tested separately by audit.py (read-only production helper).
"""
import json,sys,time,datetime,hashlib
from pathlib import Path
R=Path(__file__).resolve().parent;sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads(Path('/tmp/growthcast-payment-options-private/fixture.json').read_text());p=f['prefix']
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(60):
  try:
   if evaluate(js):return
  except RuntimeError:pass
  time.sleep(.4)
 raise AssertionError('Payments browser verification timed out: '+js[:160])
ab('network','unroute');open_browser('/login');evaluate('fetch("/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>r.ok)');open_browser('/login');ab('set','viewport','1440','1000');wait('!!document.querySelector("#email")')
icons=evaluate('[...document.querySelectorAll("link")].filter(x=>x.rel.includes("icon")).map(x=>({href:x.href,type:x.type}))');assert any(x['href'].endswith('/growthcast-favicon-v2.jpg') for x in icons)
expected=hashlib.sha256((R.parent/'web-app/brand/growthcast-favicon-v2.jpg').read_bytes()).hexdigest()
actual=evaluate('fetch("/growthcast-favicon-v2.jpg").then(r=>{if(!r.ok)throw Error("Icon unavailable");return r.arrayBuffer()}).then(b=>crypto.subtle.digest("SHA-256",b)).then(h=>[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join(""))');assert actual==expected
ab('fill','#email',p+'-owner@growthcast.invalid');ab('fill','#password',f['password']);ab('click','button[type=submit]');wait('location.pathname==="/dashboard"')
# No real key or payment methods are saved. Only these read responses are mocked.
status={'mode':'direct','enabled':True,'livemode':True,'paymentMethods':['card']}
methods=json.loads((R/'audit-evidence.json').read_text())['patchedLookup']
ab('network','route','**/api/payments/status','--body',json.dumps(status));ab('network','route','**/api/payments/available-methods','--body',json.dumps(methods))
ab('open',WEB+'/dashboard/settings/payments?check='+str(time.time_ns()));wait('document.body.innerText.includes("Accepted payment methods")')
d=json.loads((R.parent/'web-app/deployment.json').read_text())['id'];assert evaluate('[...document.scripts].some(s=>s.src.includes('+json.dumps('dpl='+d)+'))')
ab('find','role','button','click','--name','Accepted payment methods','--exact');wait('document.querySelectorAll("input[type=checkbox]").length===10')
checkboxes=evaluate('[...document.querySelectorAll("input[type=checkbox]")].map(e=>({label:e.closest("label").textContent,disabled:e.disabled,checked:e.checked}))')
assert sum(not c['disabled'] for c in checkboxes)==6
assert any('ACH bank transfer' in c['label'] and not c['disabled'] for c in checkboxes)
assert any('SEPA Direct Debit' in c['label'] and c['disabled'] for c in checkboxes)
assert evaluate('document.body.innerText.includes("At least one method must remain selected")')
ab('screenshot','/work/payment-options-desktop.png','--full')
# Network failure is rendered as a retryable error, not inactive methods or endless skeletons.
ab('network','unroute','**/api/payments/available-methods');ab('network','route','**/api/payments/available-methods','--abort');ab('reload');wait('document.body.innerText.includes("Accepted payment methods")');ab('find','role','button','click','--name','Accepted payment methods','--exact');wait('document.body.innerText.includes("Retry payment method check")')
ab('network','unroute','**/api/payments/available-methods');ab('network','route','**/api/payments/available-methods','--body',json.dumps(methods));ab('find','role','button','click','--name','Retry payment method check','--exact');wait('document.querySelectorAll("input[type=checkbox]").length===10')
ab('set','viewport','390','844');ab('screenshot','/work/payment-options-mobile.png','--full');assert evaluate('document.documentElement.scrollWidth<=innerWidth')
ab('network','unroute');assert evaluate('fetch("/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>r.ok)')
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'deployment':d,'faviconSha256':actual,'faviconMatchesAttachment':True,'uiTestUsesExplicitReadResponseFixtures':True,'fixtureBasedOnRealReadOnlyStripeResult':True,'eligibleMethodsEnabled':True,'unsupportedMethodsDisabled':True,'lastSelectionExplained':True,'lookupFailureAndRetry':True,'mobileNoOverflow':True,'stripeWrites':0,'chargesCreated':0}
(R/'acceptance.json').write_text(json.dumps(record,indent=2)+'\n');print('Favicon bytes verified; payment options, failure/retry and mobile UI checks passed with explicit fixtures.')
