"""Resumable, environment-pinned release operations. Never print secret material."""
import sys,json,os,subprocess,tempfile,uuid,time,hashlib,shutil
from pathlib import Path
R=Path(__file__).resolve().parent;D=R.parent
sys.path.insert(0,str(D/'production'))
import common as c
aws=c.aws;request=c.aws_request
CONFIG={
 'staging':dict(ref='saedetvoolpdysiyjwvg',project='prj_CMSykF9Wbj5YNwQAgl1lANn5tX3w',host='clients.staging.growthcast.app',repo='growthcast-portal-staging-backup',api='growthcast-portal-staging-api',recovery='growthcast-portal-staging-backup-orchestration'),
 'production':dict(ref='mdjldxussxdtcjxsoesr',project='prj_8w5ML4Kd8WiwprtuYgmCk0jYFYBx',host='clients.growthcast.app',repo='growthcast-portal-production',api='growthcast-portal-production-api',recovery='growthcast-portal-production-recovery')}
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
def load(p):return json.loads(p.read_text())
def checked(args,**kw):
 r=subprocess.run(args,capture_output=True,**kw)
 if r.returncode:raise RuntimeError('Command failed: '+args[0]+'; diagnostics withheld')
 return r.stdout

def template(stack):
 t=aws('cloudformation','get-template','--stack-name',stack)['TemplateBody'];return json.loads(t) if isinstance(t,str) else t

def info(stack):
 s=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]
 assert s['StackStatus'] in ['UPDATE_COMPLETE','CREATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE']
 return s,{o['OutputKey']:o['OutputValue'] for o in s['Outputs']}

def inventory(env):
 cfg=CONFIG[env];out=R/'release'/env;out.mkdir(parents=True,exist_ok=True)
 assert aws('sts','get-caller-identity')['Account']=='059393269249'
 for kind in ['api','recovery']:
  s,o=info(cfg[kind]);p=out/('before-'+kind+'.json')
  if not p.exists():save(p,{'template':template(cfg[kind]),'outputs':o,'parameters':s.get('Parameters',[])})
 project=c.vercel('/v9/projects/'+cfg['project']);assert project['name']==('growthcast-clients-staging' if env=='staging' else 'growthcast-clients')
 if not (out/'before-web.json').exists():save(out/'before-web.json',{'id':project['id'],'ssoProtection':project.get('ssoProtection'),'targets':{k:{field:v.get(field) for field in ['id','url','readyState','target']} for k,v in project.get('targets',{}).items()}})
 rows=c.supa('/v1/projects/'+cfg['ref']+'/database/query',{'query':'SELECT count(*)::int AS migrations FROM portal_meta.migrations','read_only':True})
 assert rows[0]['migrations'] in [8,9]
 print(env+': confirmed separate database, API, frontend and recovery; migrations='+str(rows[0]['migrations']),flush=True)

def baseline(env):
 out=R/'release'/env;cfg=CONFIG[env];rec=load(out/'before-recovery.json')['outputs'];arn=rec['StateMachineArn'];p=out/'baseline-execution.json'
 if not p.exists():
  running=aws('stepfunctions','list-executions','--state-machine-arn',arn,'--status-filter','RUNNING')['executions']
  if running:execution={'executionArn':running[0]['executionArn'],'existing':True}
  else:
   assert not aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':env}}),'--consistent-read').get('Item'),'Recovery lock requires reconciliation'
   execution=aws('stepfunctions','start-execution','--state-machine-arn',arn,'--name','library-baseline-'+uuid.uuid4().hex[:12],'--input','{}')
  save(p,execution)
 print(env+': baseline recovery execution recorded',flush=True)

def poll(env,kind='baseline'):
 out=R/'release'/env;x=load(out/(kind+'-execution.json'));r=aws('stepfunctions','describe-execution','--execution-arn',x['executionArn'])
 print(env+' '+kind+': '+r['status'],flush=True)
 if r['status']=='SUCCEEDED':
  output=json.loads(r['output']);assert output['status']=='VERIFIED';save(out/(kind+'-verified.json'),{'executionArn':x['executionArn'],'status':'VERIFIED','output':output})
 elif r['status']!='RUNNING':raise RuntimeError('Recovery failed; preserve lock and inspect exact execution')

def build(env):
 out=R/'release'/env;cfg=CONFIG[env];repo='059393269249.dkr.ecr.us-east-1.amazonaws.com/'+cfg['repo'];images=load(out/'images.json') if (out/'images.json').exists() else {}
 bases={'api':'growthcast-atrium-runtime','backup':'growthcast-library-backup','restore':'growthcast-library-restore'}
 with tempfile.TemporaryDirectory(prefix='growthcast-library-images-') as td:
  root=Path(td);context=json.loads(checked(['docker','context','inspect']))[0];docker_env={**os.environ,'DOCKER_CONFIG':td+'/auth','DOCKER_HOST':context['Endpoints']['docker']['Host']};docker_env.pop('DOCKER_CONTEXT',None)
  checked(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=checked(['aws','ecr','get-login-password','--region','us-east-1']),env=docker_env)
  for kind,base in bases.items():
   if kind in images:continue
   image=repo+':library-'+kind+'-'+uuid.uuid4().hex[:12]
   if env=='staging':checked(['docker','tag',base,image],env=docker_env)
   else:
    settings=load(c.PRIVATE/'settings.json');foundation=load(D/'production/foundation-resources.json');pins=load(D/'production/secret-pins.json');assert settings['projectRef']==cfg['ref']
    replacements={c.SOURCE:cfg['ref'],'1ee8ab05-20bc-45de-97ed-82a010087cd8':settings['writer']['subject'],'465b0e94-dce5-4102-9d83-437a6465b4c5':settings['reader']['subject'],load(D/'backup/job/configuration.json')['keyArn']:foundation['RestoreKeyArn'],'staging':'production'}
    files={'api':['runtime-connections/deliver.mjs'],'backup':['backup/capture.mjs','backup/job/core.mjs','backup/job/main.mjs'],'restore':['backup/restore-worker/cloud.mjs','backup/restore-worker/cloud-core.mjs','backup/verification/records.mjs','managed-recovery/verify.mjs','backup/restore-objects.mjs']}[kind]
    ctx=root/kind;ctx.mkdir()
    for name in files:
     raw=(D/name).read_text()
     for a,b in replacements.items():raw=raw.replace(a,b)
     if name=='backup/verification/records.mjs':raw=raw.replace('ageHours<=30','ageHours<=1').replace('ageHours>30','ageHours>1')
     p=ctx/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(raw);p.chmod(0o444)
    values={'api':{'runtime-secrets/runtime-pins.json':{'atrium':{**pins['runtime'],'uid':1000}},'runtime-connections/pins.json':{'atrium':pins['connection']}},'backup':{'backup/job/configuration.json':{'secretArn':foundation['BackupSecretArn'],'bucket':foundation['Bucket'],'keyArn':foundation['RestoreKeyArn']}},'restore':{}}[kind]
    for name,value in values.items():save(ctx/name,value);(ctx/name).chmod(0o444)
    files+=list(values);dest='/boundary/deployment/' if kind=='api' else '/app/deployment/'
    (ctx/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY '+name+' '+dest+name+'\n' for name in files))
    checked(['docker','build','--platform','linux/arm64','-t',image,str(ctx)],env=docker_env)
    save(out/(kind+'-overlay.json'),{'base':base,'files':{name:hashlib.sha256((ctx/name).read_bytes()).hexdigest() for name in files}})
   checked(['docker','push',image],env=docker_env)
   digest=aws('ecr','describe-images','--repository-name',cfg['repo'],'--image-ids','imageTag='+image.split(':')[-1])['imageDetails'][0]['imageDigest'];images[kind]=repo+'@'+digest;save(out/'images.json',images);print(env+': '+kind+' published and pinned',flush=True)
def web(env):
 out=R/'release'/env;cfg=CONFIG[env];p=out/'web.json'
 if p.exists():
  d=load(p);r=c.vercel('/v13/deployments/'+d['id']);d.update(readyState=r['readyState']);save(p,d);print(env+': frontend '+r['readyState'],flush=True);return
 sys.path.insert(0,str(D/'web-app'))
 from prepare import prepare
 with tempfile.TemporaryDirectory(prefix='growthcast-library-web-release-') as td:
  root=Path(td);source=prepare(root);save(root/'.vercel/project.json',{'projectId':cfg['project'],'orgId':c.v.TEAM})
  flags=['--prod','--skip-domain'] if env=='production' else ['--target','preview']
  result=checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','-v',td+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','deploy','--yes','--scope','b2b-saas',*flags,'--no-wait','--format','json'])
  r=json.loads(result);save(p,{k:r.get(k) for k in ['id','url','readyState','target']});save(out/'web-source.json',source)
 print(env+': frontend submitted without changing the live domain',flush=True)

def connection(env):
 if env=='production':pin=load(D/'production/secret-pins.json')['connection']
 else:pin=load(D/'runtime-connections/pins.json')['atrium']
 value=aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])
 result=json.loads(value['SecretString']);assert result['projectRef']==CONFIG[env]['ref'];return result

def migrate_live(env):
 out=R/'release'/env;cfg=CONFIG[env]
 assert (out/'baseline-verified.json').exists(), 'Verified pre-release recovery required'
 assert (out/'paused.json').exists(), 'Quiescent release required'
 if (out/'migration.json').exists():print(env+': migration already recorded');return
 value=connection(env)
 with tempfile.TemporaryDirectory(prefix='growthcast-library-migration-') as td:
  root=Path(td);os.chmod(td,0o700)
  (root/'ca.crt').write_text(value['databaseCa'])
  if env=='staging':admin=(Path.home()/'.config/growthcast/portal-staging/database-url').read_text().strip()
  else:
   import urllib.parse
   parts=urllib.parse.urlsplit(value['databaseUrl']);pw=(c.PRIVATE/'database-password').read_text().strip()
   admin=urllib.parse.urlunsplit((parts.scheme,'postgres.'+cfg['ref']+':'+urllib.parse.quote(pw,safe='')+'@'+parts.hostname+':'+str(parts.port or 5432),parts.path,'',''))
  (root/'admin-url').write_text(admin)
  common=['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-e','SUPABASE_PROJECT_REF='+cfg['ref'],'-v',str(D)+':/boundary/deployment:ro']
  def control(mode):return checked(common+['-v',td+':/private','growthcast-atrium-runtime','/boundary/deployment/file-library/migration-role.mjs',mode])
  try:
   control('enable');isolated=root/'isolated';isolated.mkdir(mode=0o700)
   for name in ['database-url','ca.crt']:shutil.copy2(root/name,isolated/name)
   for _ in range(18):
    result=subprocess.run(common+['-v',str(isolated)+':/migration:ro','growthcast-atrium-runtime','/boundary/deployment/file-library/migrate-live.mjs'],capture_output=True)
    if result.returncode==0:break
    if b'28P01' not in result.stderr:raise RuntimeError('Migration failed; error code: '+result.stderr.decode()[-120:])
    time.sleep(5)
   assert result.returncode==0, 'Migration credentials did not propagate'
   save(out/'migration.json',json.loads(result.stdout))
  finally:
   if (root/'role-enable-attempted').exists():control('disable')
 print(env+': migration 009 verified; migration login disabled',flush=True)

if __name__=='__main__':
 mode,env=sys.argv[1:3];assert env in CONFIG
 {'inventory':inventory,'baseline':baseline,'poll':poll,'build':build,'web':web,'migrate':migrate_live}[mode](env)
