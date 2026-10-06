import re
"""Live staging staff ingress and page checks with disposable native accounts."""
from prepare import *
import secrets,time,subprocess
OUT=Path(os.environ.get('GC_REVIEW_OUTPUT',str(OUT))).resolve()
PRIVATE=Path.home()/'.config/growthcast/guest-review-staging'

def fixture(mode):
 PRIVATE.mkdir(parents=True,exist_ok=True,mode=0o700)
 if mode=='seed' and not (PRIVATE/'fixture.json').exists():
  save(PRIVATE/'fixture.json',{'prefix':'library-'+secrets.token_hex(8),'password':secrets.token_hex(24),'projectRef':legacy.CONFIG['staging']['ref']})
  save(PRIVATE/'connection.json',legacy.connection('staging'))
 checked(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(P/'deployment')+':/boundary/deployment:ro','-v',str(PRIVATE)+':/private','growthcast-atrium-runtime','/boundary/deployment/file-library/live-fixture.mjs',mode])
 save(OUT/('fixture-'+mode+'.json'),{'status':'passed','at':legacy.c.now()})
 print('Staging document review fixture '+mode+' passed',flush=True)


def review():
 f=load(PRIVATE/'fixture.json');prefix=f['prefix'];name='growthcast-guest-live-review';host='https://clients.staging.growthcast.app';checks=[]
 checked(['docker','run','-d','--name',name,'--shm-size','1g','growthcast-portal-browser'])
 def ab(*args):return checked(['docker','exec',name,'agent-browser',*args]).decode()
 def ev(js):return json.loads(ab('eval',js,'--json'))['data']['result']
 def wait(js):
  for _ in range(75):
   if ev(js):return
   time.sleep(.4)
  raise RuntimeError('Browser condition timed out')
 def login(who):
  ab('open',host+'/login');wait('!!document.querySelector("#email")');ab('fill','#email',prefix+'-'+who+'@growthcast.invalid');ab('fill','#password',f['password']);ab('click','button[type=submit]');wait('!location.pathname.includes("login")')
 try:
  token=checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','growthcast-vercel-cli','project','token','growthcast-clients-staging','--scope','b2b-saas']).decode().strip();assert token.count('.')==2
  ab('open',host+'/login','--headers',json.dumps({'x-vercel-trusted-oidc-idp-token':token}));del token
  assert ev("fetch('/api/guest/staff/catalog').then(r=>r.status)")==403;checks.append('anonymous staff catalog refused by deployed runtime')
  login('owner');wait('!!document.querySelector("nav.space-y-1")')
  labels=ev('[...document.querySelector("nav.space-y-1").querySelectorAll("a")].map(x=>x.textContent.trim())')
  assert labels==['Overview','Projects','Calendar','People','Reports','Documents','Library','Settings'],labels
  checks.append('requested sidebar order preserved')
  wait('document.querySelectorAll("section[aria-label$=preview]").length===6')
  wait('![...document.querySelectorAll("section[aria-label$=preview]")].some(s=>s.innerText.includes("Loading"))')
  assert ev('[...document.querySelectorAll("section[aria-label$=preview] h2")].map(x=>x.textContent)')==['Projects','Calendar','People','Reports','Documents','Library']
  assert not ev('document.body.innerText.includes("Could not load this preview")')
  assert ev('document.querySelector(`section[aria-label="Projects preview"]`).innerText.includes("Library release review")')
  assert ev('document.querySelector(`section[aria-label="Documents preview"]`).innerText.includes("No documents yet")')
  assert not ev('document.body.innerText.includes("Recent Projects")')
  checks.append('Overview tiles display scoped project data and correct empty states for six sidebar sections')
  ab('set','viewport','390','844');assert ev('document.documentElement.scrollWidth<=innerWidth+1');ab('set','viewport','1440','1000')
  checks.append('Overview preview tiles fit the mobile viewport')
  ab('click','@'+re.search(r'link "Documents" \[ref=(e\d+)\]',ab('snapshot','-i')).group(1));wait('document.body.innerText.includes("Clients & recipients")')
  catalog=ev("fetch('/api/guest/staff/catalog').then(async r=>({status:r.status,data:await r.json()}))")
  assert catalog['status']==200 and catalog['data']['projects']['items']==[{'id':prefix+'-project','name':'Library release review'}]
  assert catalog['data']['documents']['items']==[];checks.append('native owner session reaches restricted deployed catalog with exact workspace scope')
  assert not ev('document.body.innerText.includes("Could not load documents")');ab('set','viewport','390','844');assert ev('document.documentElement.scrollWidth<=innerWidth+1');checks.append('Documents page renders at mobile width')
  assert ev("fetch('/api/guest/document').then(r=>r.status)")==404;checks.append('guest delivery route remains disabled')
  if os.environ.get('GC_REVIEW_FIELDS')=='1':
   capabilities=ev("fetch('/api/guest/staff/capabilities').then(async r=>({status:r.status,data:await r.json()}))")
   assert capabilities=={'status':200,'data':{'sending':False}};checks.append('updated staff runtime reports sending disabled until live signing integration is ready')
  if os.environ.get('GC_REVIEW_CATALOG')=='1':
   assert ev('!!document.querySelector(`button[aria-label="Document catalog actions"]`)')
   ab('find','role','button','click','--name','Document catalog actions','--exact');wait('!!document.querySelector(`[role="menu"]`)')
   assert ev('[...document.querySelectorAll(`[role="menuitem"]`)].map(x=>x.textContent)')==['Create document','Refresh documents']
   ab('press','Escape');ab('find','role','button','click','--name','Clients & recipients','--exact')
   assert ev('!!document.querySelector(`button[aria-label="Clients actions"]`) && !!document.querySelector(`button[aria-label="Recipients actions"]`)')
   ab('find','role','button','click','--name','Clients actions','--exact');ab('find','role','menuitem','click','--name','Add client','--exact');wait('!!document.querySelector("input[name=name]")')
   ab('find','role','button','click','--name','Cancel','--exact');checks.append('live document, client and recipient three-dot menus expose creation and refresh with keyboard dismissal')
  ev("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(()=>true)")
  login('client');assert ev("fetch('/api/guest/staff/catalog').then(r=>r.status)")==403
  ab('open',host+'/dashboard/documents');wait('location.pathname.startsWith("/portal")');checks.append('client sessions cannot use staff catalog or Documents page')
  save(OUT/'browser.json',{'at':legacy.c.now(),'host':host,'checks':checks,'passed':len(checks),'realEmailsSent':0,'scope':'deployed read-only staff ingress and UI; upload/approval browser writes verified locally'})
  print('Live staging checks passed: '+str(len(checks)),flush=True)
 finally:checked(['docker','rm','-f',name])

if __name__=='__main__':
 mode=sys.argv[1]
 if mode in ['seed','cleanup']:fixture(mode)
 elif mode=='review':review()
 else:raise ValueError('Unsupported mode')
