"""Explicit production release helpers; suppress provider bodies that may contain secrets."""
import datetime,importlib.util,json,os,subprocess,time,urllib.request,urllib.error
from pathlib import Path
R=Path(__file__).resolve().parent
D=R.parent
PRIVATE=Path.home()/'.config/growthcast/portal-production'
SOURCE='saedetvoolpdysiyjwvg';ORG='nphtmrwksahmpruxzhzj'
os.umask(0o077)
PRIVATE.mkdir(mode=0o700,parents=True,exist_ok=True)
def load(path):return json.loads(Path(path).read_text())
def save(path,value):Path(path).write_text(json.dumps(value,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
spec=importlib.util.spec_from_file_location('release_aws',D/'phase-2-closeout/aws.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
aws=a.aws;aws_request=a.request
spec=importlib.util.spec_from_file_location('release_vercel',D/'proxy-secret/transfer.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
vercel=v.vercel
_token=None
def http(url,headers,body=None,method=None):
 req=urllib.request.Request(url,headers=headers,data=json.dumps(body).encode() if body is not None else None,method=method)
 try:
  with urllib.request.urlopen(req,timeout=90) as f:
   b=f.read();return json.loads(b) if b else None
 except urllib.error.HTTPError as e:raise RuntimeError('Provider HTTP '+str(e.code)+' for '+urllib.parse.urlparse(url).path) from None

def supa(path,body=None,method=None):
 global _token
 if _token is None:_token=subprocess.run(['/usr/bin/security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
 return http('https://api.supabase.com'+path,{'Authorization':'Bearer '+_token,'Content-Type':'application/json'},body,method)
def query(ref,sql,readonly=True):
 assert ref==SOURCE if readonly else ref==load(R/'database.json')['projectRef']
 return supa('/v1/projects/'+ref+'/database/query',{'query':sql,'read_only':readonly})
def checked(cmd,**kwargs):
 r=subprocess.run(cmd,capture_output=True,**kwargs)
 if r.returncode:raise RuntimeError('Command failed; sensitive output withheld: '+str(cmd[0]))
 return r.stdout
