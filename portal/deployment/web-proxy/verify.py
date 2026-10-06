"""Exercise HTTPS proxy through authenticated CLI without logging bypass material."""
import datetime,json,subprocess,tempfile,urllib.request,urllib.error
from pathlib import Path
R=Path(__file__).resolve().parent
WEB='https://clients.staging.growthcast.app';API='https://api.clients.staging.growthcast.app'
def cli(path,extra=()):
 with tempfile.TemporaryDirectory(prefix='growthcast-curl-') as d:
  p=Path(d);(p/'.vercel').mkdir();(p/'.vercel/project.json').write_text(json.dumps({'projectId':'prj_CMSykF9Wbj5YNwQAgl1lANn5tX3w','orgId':'team_rPWWEtg8Y7oXBuA7rUHohbU1'}))
  cmd=['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','-v',str(p)+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-verify','curl',path,'--deployment',WEB,'--scope','b2b-saas','--','--silent','--show-error','--max-time','35','--write-out','\n%{http_code}',*extra]
  r=subprocess.run(cmd,capture_output=True,text=True)
  assert r.returncode==0,'Authenticated HTTP check failed; output suppressed'
  body,code=r.stdout.rsplit('\n',1)
  return int(code.strip()),body
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
def public(url,headers=None):
 try:
  with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers=headers or {}),timeout=30) as r:return r.status
 except urllib.error.HTTPError as e:return e.code

def main():
 results={}
 results['publicFrontend']=public(WEB+'/api/health');assert results['publicFrontend'] in [401,403,302,307]
 results['directApiWithoutProof']=public(API+'/api/health');assert results['directApiWithoutProof']==403
 results['directApiForgedProof']=public(API+'/api/health',{'x-growthcast-origin':'0'*64});assert results['directApiForgedProof']==403
 code,body=cli('/api/health');results['proxyHealth']=code;assert code==200,'Proxy health failed: '+str(code)
 code,_=cli('/api/health',['--header','x-growthcast-origin: '+'0'*64]);results['forgedClientProofOverwritten']=code;assert code==200
 code,_=cli('/api/files/staging-anonymous-probe/download');results['anonymousPrivateFileDenied']=code;assert code in [401,403]
 code,_=cli('/api/auth/sign-in/email',['--request','POST','--header','Content-Type: application/json','--data','{}']);results['missingOriginMutationDenied']=code;assert code==403
 code,_=cli('/api/auth/sign-in/email',['--request','POST','--header','Origin: https://untrusted.invalid','--header','Content-Type: application/json','--data','{}']);results['crossOriginMutationDenied']=code;assert code==403
 r={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','checks':results,'runtimeConsumptionVerified':True,'fullBrowserAccountFlowVerified':False}
 (R/'evidence.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
if __name__=='__main__':main()
