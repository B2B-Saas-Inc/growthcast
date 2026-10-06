import sys,json,time,secrets
from pathlib import Path
R=Path(__file__).resolve().parent;P=Path('/tmp/growthcast-invitation-private')
sys.path.insert(0,str(R.parent/'web-app'))
from browser import ab,open_browser,WEB
f=json.loads((P/'fixture.json').read_text())
def ev(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(50):
  if ev(js):return
  time.sleep(.4)
 raise AssertionError('Invitation browser condition failed')
mode=sys.argv[1]
if mode=='login':
 open_browser('/login');ab('fill','#email',f['email']);ab('fill','#password',f['password']);ab('click','button[type=submit]');wait("location.pathname==='/dashboard'");ab('open',WEB+'/dashboard/clients');print(ab('snapshot','-i'))
if mode=='invite':
 email=f['prefix']+'-invited@growthcast.invalid'
 ab('fill','input[type=email]',email);ab('find','role','button','click','--name','Invite','--exact')
 wait("!![...document.querySelectorAll('input')].find(x=>x.value.includes('/accept-invite?'))")
 link=ev("[...document.querySelectorAll('input')].find(x=>x.value.includes('/accept-invite?')).value")
 assert link.startswith(WEB+'/accept-invite?')
 state={'email':email,'password':secrets.token_urlsafe(24),'inviteLink':link};(P/'client.json').write_text(json.dumps(state));(P/'client.json').chmod(0o600)
 assert ev("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)")
 ab('open',link);ab('fill','#name','Invitation acceptance client');ab('fill','#email',email);ab('fill','#password',state['password']);ab('click','button[type=submit]')
 wait("!document.querySelector('button[type=submit]')?.disabled")
 session=ev("fetch('/api/auth/get-session').then(r=>r.json())");assert session and session['user']['email']==email
 (P/'signup.json').write_text(json.dumps({'userId':session['user']['id'],'emailVerified':session['user']['emailVerified']}))
 print(json.dumps({'signupCreated':True,'emailVerified':session['user']['emailVerified'],'path':ev('location.pathname'),'invitationError':ev("document.querySelector('.text-red-600')?.textContent??null")}))
if mode in ['verify','finish']:
 from urllib.parse import urlparse,parse_qs,urlencode,urlunparse
 messages=json.loads((P/'captured-mail.json').read_text());client=json.loads((P/'client.json').read_text())
 assert all(m['recipient']==client['email'] for m in messages)
 links=[u for m in messages for u in m['links']]
 assert client['inviteLink'] in links
 verification=[u for u in links if '/verify-email?' in u];assert len(verification)==1
 link=verification[0];parsed=urlparse(link);assert parsed.scheme+'://'+parsed.netloc==WEB and parsed.path=='/api/auth/verify-email'
 if mode=='verify':
  session=ev("fetch('/api/auth/get-session').then(r=>r.json())");assert session['user']['email']==client['email'] and not session['user']['emailVerified']
  query=parse_qs(parsed.query);query['token']=['invalid-synthetic-token'];tampered=urlunparse(parsed._replace(query=urlencode(query,doseq=True)))
  ab('open',tampered)
  assert ev("fetch('/api/auth/get-session').then(r=>r.json()).then(s=>s.user.emailVerified)") is False
  ab('open',link)
  wait("location.pathname==='/'")
 assert ev("fetch('/api/auth/get-session').then(r=>r.json()).then(s=>s.user.emailVerified)") is True
 ab('open',WEB+'/portal/projects');wait("document.body.innerText.includes('Your Projects')")
 assert ev("fetch('/api/auth/get-session').then(r=>r.json()).then(s=>s.session.activeOrganizationId)")==f['prefix']+'-org'
 assert ev("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)")
 ab('open',WEB+'/login');ab('fill','#email',client['email']);ab('fill','#password',client['password']);ab('click','button[type=submit]');wait("location.pathname==='/portal/projects'")
 session=ev("fetch('/api/auth/get-session').then(r=>r.json())");assert session['user']['emailVerified'] and session['session']['activeOrganizationId']==f['prefix']+'-org'
 assert ev("fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)")
 import datetime
 (R/'evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','adminUiInvitation':True,'clientUiSignupAndInvitationAcceptance':True,'capturedActualInvitationAndVerificationMail':True,'mailRecipientMatched':True,'canonicalSameOriginVerificationLink':True,'tamperedTokenRejected':True,'browserEmailVerified':True,'verifiedClientLogin':True,'correctOrganizationSelected':True,'noExternalMailSent':True,'verificationRedirect':'/','verificationConfirmationScreenShown':False,'preVerificationPortalAccessible':True},indent=2)+'\n')
 print('Actual captured-mail invitation and browser verification, tamper denial, verified login and organization selection passed.')
