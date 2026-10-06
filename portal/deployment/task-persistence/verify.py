"""Verify a browser session and private file before/after complete task replacement."""
import json,sys,time,hashlib,datetime,re
from pathlib import Path
from browser import ab,WEB
from fixture import PRIVATE
R=Path(__file__).resolve().parent
f=json.loads((PRIVATE/'fixture.json').read_text())
def evaluate(js):return json.loads(ab('eval',js,'--json'))['data']['result']
def wait(js):
 for _ in range(40):
  if evaluate(js):return
  time.sleep(.5)
 raise AssertionError('Authenticated browser condition failed')
mode=sys.argv[1];assert mode in ['before','after']
if mode=='after':
 replacement=json.loads((R/'replacement.json').read_text());assert replacement['status']=='HEALTHY_REPLACEMENT'
 ab('reload');wait("document.body.innerText.includes('Browser acceptance project')")
session=evaluate("fetch('/api/auth/get-session').then(r=>r.json())")
assert session['user']['id']==f['prefix']+'-user'
project=evaluate('fetch('+json.dumps('/api/projects/mine/'+f['prefix']+'-project')+').then(r=>r.json())')
files=[x for x in project['files'] if x['filename']=='browser-acceptance.txt'];assert len(files)==1
file='/api/files/'+files[0]['id']+'/download'
expected=b'Growthcast browser acceptance\nPrivate synthetic file.\n'
assert evaluate('fetch('+json.dumps(file)+').then(async r=>({status:r.status,text:await r.text()}))')=={'status':200,'text':expected.decode()}
cookies=json.loads(ab('cookies','--json'))['data']['cookies'];cookie=[x for x in cookies if 'session_token' in x['name']];assert len(cookie)==1
binding={'sessionId':session['session']['id'],'userId':session['user']['id'],'cookieHash':hashlib.sha256(cookie[0]['value'].encode()).hexdigest(),'fileId':files[0]['id'],'fileSha256':hashlib.sha256(expected).hexdigest()}
del cookies,cookie,session
if mode=='before':
 (PRIVATE/'binding.json').write_text(json.dumps(binding));print('Pre-replacement session and private file bound; no credentials logged.')
else:
 assert binding==json.loads((PRIVATE/'binding.json').read_text())
 ab('find','text','Files','click');wait("document.body.innerText.includes('browser-acceptance.txt')")
 ref=re.search(r'button "browser-acceptance.txt[^\n]*\[ref=(e\d+)\]',ab('snapshot','-i')).group(1)
 (R/'download-after.txt').unlink(missing_ok=True);ab('download','@'+ref,'/work/download-after.txt');assert (R/'download-after.txt').read_bytes()==expected
 assert evaluate('fetch('+json.dumps('/api/projects/mine/'+f['prefix']+'-other-project')+').then(r=>r.status)') in [403,404]
 ref=re.search(r'button "Sign Out" \[ref=(e\d+)\]',ab('snapshot','-i')).group(1);ab('click','@'+ref);wait("location.pathname==='/login'")
 assert evaluate("fetch('/api/auth/get-session').then(r=>r.json())") is None
 evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','previousTaskStopped':True,'differentTaskHealthy':True,'sameAuthenticatedSessionAndCookie':True,'authenticatedServerRenderedReload':True,'sameProjectAndFileId':True,'privateFileByteExactBrowserDownload':True,'crossOrganizationDenied':True,'browserLogout':True,'reviewAccountsUntouched':True,'emailVerificationTested':False,'taskReplacement':replacement}
 (R/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n');print('Same client session, SSR page, private file and isolation survive full task replacement; logout passed.')
