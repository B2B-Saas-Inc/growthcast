"""Continue the live browser fixture through download, isolation and revocation."""
import datetime,json,sys,time,re
from pathlib import Path
from browser import ab,WEB
from fixture import action,PRIVATE
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'web-proxy'))
from verify import cli
R=Path(__file__).resolve().parent
f=json.loads((PRIVATE/'fixture.json').read_text());prefix=f['prefix']
def evaluate(code):
 r=json.loads(ab('eval',code,'--json'));assert r['success'];return r['data']['result']
def status(path,method='GET',headers=None):
 return evaluate('fetch('+json.dumps(path)+','+json.dumps({'method':method,'headers':headers or {}})+').then(r=>r.status)')
try:
 assert (R/'download.txt').read_bytes()==b'Growthcast browser acceptance\nPrivate synthetic file.\n'
 cookies=json.loads(ab('cookies','--json'))['data']['cookies'];session=[c for c in cookies if 'session_token' in c['name']];assert len(session)==1
 c=session[0];assert c['secure'] and c['httpOnly'] and c['domain']=='clients.staging.growthcast.app' and c['sameSite'].lower()=='lax'
 replay=c['name']+'='+c['value']
 ab('reload')
 for _ in range(20):
  if evaluate('document.body.innerText.includes("Browser acceptance project")'):break
  time.sleep(.5)
 else:raise AssertionError('Server-rendered authenticated reload failed')
 data=evaluate('fetch('+json.dumps('/api/projects/mine/'+prefix+'-project')+').then(r=>r.json())');files=[x for x in data['files'] if x['filename']=='browser-acceptance.txt'];assert len(files)==1
 file='/api/files/'+files[0]['id']+'/download'
 assert status(file)==200
 assert status('/api/projects/mine/'+prefix+'-other-project') in [403,404]
 assert evaluate('fetch("/api/auth/organization/set-active",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:'+json.dumps(prefix+'-other')+'})}).then(r=>r.status)')==403
 ab('screenshot','/work/project.png')
 action('revoke')
 assert status(file)==403 and status(file,'HEAD')==403 and status(file,'GET',{'Range':'bytes=0-8'})==403
 snapshot=ab('snapshot','-i');ref=re.search(r'button "Sign Out" \[ref=(e\d+)\]',snapshot).group(1)
 ab('click','@'+ref);ab('wait','--url','**/login')
 assert evaluate('fetch("/api/auth/get-session").then(r=>r.json())') is None
 code,body=cli('/api/auth/get-session',['--header','Cookie: '+replay]);assert code==200 and json.loads(body) is None
 del replay,cookies,session,c
 record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','syntheticPreverifiedAccount':True,'browserLogin':True,'serverRenderedReload':True,'sameOriginSecureHostOnlySessionCookie':True,'browserFileUploadAndByteExactDownload':True,'otherOrganizationProjectDenied':True,'revokedFileGetHeadRangeDenied':True,'browserLogoutAndSessionReplayDenied':True,'emailVerificationTested':False,'sessionAcrossTaskReplacementTested':False}
 (R/'browser-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Browser login, SSR reload, private file bytes, organization isolation, revocation, logout and replay checks passed.')
finally:
 action('cleanup')
