"""Synthetic browser acceptance through the deployed frontend, API and private Storage."""
from release import *
import secrets

def private(env):return Path.home()/'.config/growthcast'/('library-review-'+env)
def fixture(env,mode):
 p=private(env);p.mkdir(mode=0o700,parents=True,exist_ok=True)
 if mode=='seed' and (R/'release'/env/'fixture-cleanup.json').exists():
  for name in ['fixture.json','connection.json','review-objects.json','cleanup-keys.json']:(p/name).unlink(missing_ok=True)
  (R/'release'/env/'fixture-cleanup.json').unlink()
 if mode=='seed' and not (p/'fixture.json').exists():
  save(p/'fixture.json',{'prefix':'library-'+secrets.token_hex(8),'password':secrets.token_hex(24),'projectRef':CONFIG[env]['ref']});save(p/'connection.json',connection(env))
 assert (p/'fixture.json').exists()
 checked(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(D)+':/boundary/deployment:ro','-v',str(p)+':/private','growthcast-atrium-runtime','/boundary/deployment/file-library/live-fixture.mjs',mode])
 save(R/'release'/env/('fixture-'+mode+'.json'),{'status':'passed','at':c.now()});print(env+': synthetic fixture '+mode+' passed',flush=True)

def review(env):
 cfg=CONFIG[env];out=R/'release'/env;f=load(private(env)/'fixture.json');prefix=f['prefix'];name='growthcast-library-review-'+env;host='https://'+cfg['host'];checks=[]
 checked(['docker','run','-d','--name',name,'--shm-size','1g','growthcast-portal-browser'])
 def ab(*args):return checked(['docker','exec',name,'agent-browser',*args]).decode()
 def ev(js):return json.loads(ab('eval',js,'--json'))['data']['result']
 def wait(js):
  for _ in range(75):
   if ev(js):return
   time.sleep(.4)
  raise RuntimeError('Browser condition timed out: '+js[:120])
 def page(path):ab('open',host+path)
 def login(who):
  page('/login');wait('!!document.querySelector("#email")');ab('fill','#email',prefix+'-'+who+'@growthcast.invalid');ab('fill','#password',f['password']);ab('click','button[type=submit]');wait('!location.pathname.includes("login")')
 def api(path,method='GET',data=None,upload=None):
  body=('(()=>{const f=new FormData();f.append("file",new Blob(['+json.dumps(upload['text'])+'],{type:'+json.dumps('application/pdf' if upload['name'].endswith('.pdf') else 'application/octet-stream')+'}),'+json.dumps(upload['name'])+');'+''.join('f.append('+json.dumps(k)+','+json.dumps(v)+');' for k,v in (data or {}).items())+'return f;})()') if upload else ('JSON.stringify('+json.dumps(data)+')' if data is not None else 'undefined')
  return ev('(async()=>{const csrf=document.cookie.split("; ").find(v=>v.startsWith("csrf-token="))?.split("=")[1];const r=await fetch('+json.dumps('/api'+path)+',{method:'+json.dumps(method)+',headers:{"x-csrf-token":decodeURIComponent(csrf||""),'+('' if upload else '"content-type":"application/json",')+'},body:'+body+'});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=null}return {status:r.status,data};})()')
 try:
  if env=='staging':
   token=checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','growthcast-vercel-cli','project','token','growthcast-clients-staging','--scope','b2b-saas']).decode().strip();assert token.count('.')==2
   ab('open',host+'/login','--headers',json.dumps({'x-vercel-trusted-oidc-idp-token':token}));del token
  ab('set','viewport','1440','1000');login('owner')
  wait('!!document.querySelector("nav.space-y-1")')
  labels=ev('[...document.querySelector("nav.space-y-1").querySelectorAll("a")].map(a=>a.textContent.trim())')
  assert labels==['Overview','Projects','Calendar','People','Reports','Library','Settings'],'Sidebar order differs from requested order'
  checks.append('sidebar follows the requested Overview through Settings order')
  if not (private(env)/'review-objects.json').exists():
   contract=api('/documents','POST',{'projectId':prefix+'-project','type':'contract','title':'Executed contract review'},upload={'name':'executed.pdf','text':'%PDF-1.7\nSynthetic review only\n%%EOF'})
   assert contract['status']==201 and contract['data']['status']=='uploaded' and not contract['data']['sentAt'], 'Upload-only contract failed'
   checks.append('upload-only contract is Uploaded with no send timestamp')
   html='<!doctype html><html><head><style>body{font-family:Arial;padding:32px;color:#175c4a}h1{font-size:30px}</style></head><body><h1>GrowthCast SOP review</h1><p>Synthetic release verification.</p><script>parent.document.body.dataset.previewEscaped="yes"</script></body></html>'
   original=api('/library/upload','POST',upload={'name':'SOP.html','text':html});assert original['status']==201,'Library upload failed'
   libraryId=original['data']['id'];share=api('/library/'+libraryId+'/share','POST',{'projectId':prefix+'-project'});assert share['status']==201,'Library share failed'
   fileId=share['data']['id'];save(private(env)/'review-objects.json',{'libraryId':libraryId,'fileId':fileId})
  else:
   checks.append('upload-only contract was verified Uploaded with no send timestamp')
  page('/dashboard/library');wait('document.body.innerText.includes("SOP.html")');ab('snapshot','-i');ab('find','role','button','click','--name','Preview','--exact');wait('!!document.querySelector("iframe[srcdoc]")')
  assert ev('document.querySelector("iframe").getAttribute("sandbox")==="" && !document.body.dataset.previewEscaped && !document.querySelector("iframe").srcdoc.includes("<script")');checks.append('admin Library HTML opens in a sandboxed modal')
  ab('find','role','button','click','--name','Close HTML preview','--exact');wait('!document.querySelector("iframe[srcdoc]")');assert ev('document.activeElement.textContent==="Preview"')
  page('/dashboard/projects/'+prefix+'-project?tab=files');wait('document.body.innerText.includes("Executed contract review")');assert ev('document.body.innerText.toLowerCase().includes("uploaded")')
  ab('find','role','button','click','--name','Add files','--exact');ab('find','role','button','click','--name','From Library');wait('document.body.innerText.includes("Add from Library")');ab('find','role','button','click','--name','Close Library','--exact');checks.append('project Files exposes the Library picker and Uploaded contract')
  ev("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(()=>true)");login('client')
  assert api('/library')['status']==403;checks.append('client access to private Library originals denied')
  page('/portal/projects/'+prefix+'-project?tab=files');wait('document.body.innerText.includes("SOP.html")');ab('find','text','SOP.html','click');wait('!!document.querySelector("iframe[srcdoc]")');ab('set','viewport','390','844');assert ev('document.documentElement.scrollWidth<=innerWidth+1 && !document.body.dataset.previewEscaped');checks.append('assigned client opens shared HTML in a mobile modal')
  save(out/'browser.json',{'at':c.now(),'host':cfg['host'],'checks':checks,'passed':len(checks),'syntheticWorkspace':True});print(env+': live browser checks passed: '+str(len(checks)),flush=True)
 finally:checked(['docker','rm','-f',name])

if __name__=='__main__':
 mode,env=sys.argv[1:3];assert env in CONFIG
 if mode in ['seed','cleanup']:fixture(env,mode)
 elif mode=='review':review(env)
 else:raise ValueError('Unsupported mode')
