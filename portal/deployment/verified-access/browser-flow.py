"""Regression of existing-session denial and new-client verification."""
import sys,json,time,secrets,datetime
from pathlib import Path
from urllib.parse import urlparse,parse_qs,urlencode,urlunparse
R=Path(__file__).resolve().parent;P=Path('/tmp/growthcast-verified-private')
sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads((P/'fixture.json').read_text())
def ev(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(60):
  try:
   if ev(js):return
  except RuntimeError:pass
  time.sleep(.4)
 raise AssertionError('Verified-access browser condition failed')
def logout():assert ev("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)")
def login(email,password):
 ab('open',WEB+'/login');ab('fill','#email',email);ab('fill','#password',password);ab('click','button[type=submit]')
mode=sys.argv[1]
if mode=='login':
 open_browser('/login');login(f['email'],f['password']);wait("location.pathname==='/dashboard'");print('Disposable verified owner session established.')
if mode=='deny':
 session=ev("fetch('/api/auth/get-session').then(r=>r.json())");assert session['user']['emailVerified'] is False
 statuses={}
 for path in ['/api/projects','/api/projects/mine','/api/clients/me/profile','/api/files/nonexistent/download']:
  statuses[path]=ev('fetch('+json.dumps(path)+').then(r=>r.status)');assert statuses[path]==403
 ab('open',WEB+'/portal/projects');wait("location.pathname==='/verify-email'")
 ab('open',WEB+'/dashboard');wait("location.pathname==='/verify-email'")
 ab('open',WEB+'/verify-email?verified=true');wait("document.body.innerText.includes('Check your email')")
 (R/'existing-session-evidence.json').write_text(json.dumps({'privateEndpointStatuses':statuses,'portalAndAdminRedirect':True,'confirmationQueryCannotFakeVerification':True},indent=2)+'\n');logout();print('Existing unverified session denied by API and page routes; forged confirmation flag ignored.')
if mode=='invite':
 login(f['email'],f['password']);wait("location.pathname==='/dashboard'");ab('open',WEB+'/dashboard/clients');wait("document.body.innerText.includes('Invite a Team Member')");ab('find','role','button','click','--name','Clients','--exact');wait("!!document.querySelector('input[placeholder=\"client@example.com\"]')")
 email=f['prefix']+'-invited@growthcast.invalid';ab('fill','input[placeholder="client@example.com"]',email);ab('find','role','button','click','--name','Invite','--exact');wait("!![...document.querySelectorAll('input')].find(x=>x.value.includes('/accept-invite?'))")
 link=ev("[...document.querySelectorAll('input')].find(x=>x.value.includes('/accept-invite?')).value");assert link.startswith(WEB+'/accept-invite?')
 invitations=ev("fetch('/api/clients/invitations').then(r=>r.json())");assert next(i for i in invitations if i['email']==email)['role']=='member'
 c={'email':email,'password':secrets.token_urlsafe(24),'inviteLink':link};(P/'client.json').write_text(json.dumps(c));logout()
 ab('open',link);ab('fill','#name','Verified client acceptance');ab('fill','#email',email);ab('fill','#password',c['password']);ab('click','button[type=submit]');wait("location.pathname==='/verify-email' && document.body.innerText.includes('Check your email')")
if mode in ['invite','signup-check']:
 c=json.loads((P/'client.json').read_text());email=c['email'];link=c['inviteLink']
 assert ev("fetch('/api/auth/get-session').then(r=>r.json())") is None
 assert ev("fetch('/api/projects/mine').then(r=>r.status)")==401
 ab('open',WEB+'/portal/projects');wait("location.pathname==='/login'")
 # Direct sign-in must fail before verification; only bounded status/code is retained.
 denial=ev('fetch("/api/auth/sign-in/email",{method:"POST",headers:{"Content-Type":"application/json"},body:'+json.dumps(json.dumps({'email':email,'password':c['password'],'callbackURL':WEB+'/verify-email?verified=true&invitationId='+parse_qs(urlparse(link).query)['id'][0]}))+'}).then(async r=>({status:r.status,code:(await r.json()).code}))')
 assert denial['status']==403 and denial['code']=='EMAIL_NOT_VERIFIED'
 (R/'new-user-denial.json').write_text(json.dumps({'signupCreatesNoSession':True,'privateApi401':True,'portalRedirectsLogin':True,'unverifiedLogin':denial},indent=2)+'\n');print('New signup awaits verification, receives no session, and cannot log in or read projects.')
if mode=='verify':
 c=json.loads((P/'client.json').read_text());messages=json.loads((P/'captured-mail.json').read_text());assert all(m['recipient']==c['email'] for m in messages)
 links=[u for m in messages for u in m['links']];assert c['inviteLink'] in links
 verification=[u for u in links if '/verify-email?' in u];assert verification
 link=verification[-1];parsed=urlparse(link);assert parsed.scheme+'://'+parsed.netloc==WEB
 callback=parse_qs(parsed.query).get('callbackURL',[''])[0];assert callback.startswith(WEB+'/verify-email?verified=true&invitationId=')
 query=parse_qs(parsed.query);query['token']=['invalid'];ab('open',urlunparse(parsed._replace(query=urlencode(query,doseq=True))))
 assert ev("fetch('/api/auth/get-session').then(r=>r.json())") is None
 ab('open',link);wait("location.pathname==='/verify-email' && document.body.innerText.includes('Email verified!')")
 assert ev("fetch('/api/auth/get-session').then(r=>r.json()).then(s=>s.user.emailVerified)") is True
 ab('set','viewport','1440','1000');ab('screenshot','/work/email-confirmed.png')
 ab('set','viewport','390','844');ab('screenshot','/work/email-confirmed-mobile.png');assert ev('document.documentElement.scrollWidth<=innerWidth');ab('set','viewport','1440','1000')
 ab('find','role','link','click','--name','Continue to portal');wait("location.pathname==='/portal/projects'")
 assert ev("fetch('/api/auth/get-session').then(r=>r.json()).then(s=>s.session.activeOrganizationId)")==f['prefix']+'-org'
 assert ev("fetch('/api/projects/mine').then(r=>r.status)")==200
 ab('screenshot','/work/verified-client.png');logout();login(c['email'],c['password']);wait("location.pathname==='/portal/projects'")
 assert ev("fetch('/api/auth/get-session').then(r=>r.json()).then(s=>s.user.emailVerified)") is True
 logout();(R/'browser-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualCapturedMail':True,'tamperedVerificationDenied':True,'verifiedConfirmationShown':True,'invitationAcceptedAfterVerification':True,'verifiedPortalAccess':True,'verifiedFreshLogin':True},indent=2)+'\n');print('Captured-mail verification, confirmation, invitation completion and fresh client login passed.')
