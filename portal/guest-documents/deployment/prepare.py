"""Prepare staging artifacts without changing the live domain, task or database."""
from pathlib import Path
import importlib.util,json,sys,tempfile,os,uuid,hashlib,re,shutil
R=Path(__file__).resolve().parent
P=R.parents[1]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
legacy=module('library_release',P/'deployment/file-library/release.py')
legacy.R=R
aws=legacy.aws;save=legacy.save;load=legacy.load;checked=legacy.checked
OUT=R/'release/staging'
REPO='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'

def images(catalog=False,signing=False):
 if signing:catalog=True
 before=load(OUT/'before-api.json')['template']
 bases={'api':next(x['Image'] for x in before['Resources']['Task']['Properties']['ContainerDefinitions'] if x['Name']=='api')}
 if signing:bases['api']='growthcast-atrium-runtime'
 workflow=json.dumps(load(OUT/'before-recovery.json')['template'])
 for kind,family in [('backup','backup'),('restore','restore')]:
  refs=set(re.findall(r'arn:aws:ecs:us-east-1:059393269249:task-definition/growthcast-portal-staging-'+family+r':\d+',workflow));assert len(refs)==1
  task=aws('ecs','describe-task-definition','--task-definition',refs.pop())['taskDefinition']
  assert len(task['containerDefinitions'])==1;bases[kind]=task['containerDefinitions'][0]['image']
 state=load(OUT/'images.json') if (OUT/'images.json').exists() else {}
 manifest=load(P/'deployment/supabase/managed-atrium/migrations/manifest.json');assert len(manifest['migrations'])==9
 sql=P/'guest-documents/schema.sql';name='010-guest-documents.sql'
 manifest['migrations'].append({'name':name,'sha256':hashlib.sha256(sql.read_bytes()).hexdigest()})
 if catalog:
  for file,name in [('schema.sql','011-guest-catalog.sql'),('restore-stable.sql','012-catalog-restore-stable.sql')]:manifest['migrations'].append({'name':name,'sha256':hashlib.sha256((P/'guest-documents/catalog'/file).read_bytes()).hexdigest()})
 if signing:manifest['migrations'].append({'name':'013-document-delivery.sql','sha256':hashlib.sha256((P/'guest-documents/signing/delivery.sql').read_bytes()).hexdigest()})
 with tempfile.TemporaryDirectory(prefix='growthcast-guest-release-') as td:
  root=Path(td);context=json.loads(checked(['docker','context','inspect']))[0]
  env={**os.environ,'DOCKER_CONFIG':td+'/auth','DOCKER_HOST':context['Endpoints']['docker']['Host']};env.pop('DOCKER_CONTEXT',None)
  checked(['docker','login',REPO.split('/')[0],'--username','AWS','--password-stdin'],input=checked(['aws','ecr','get-login-password','--region','us-east-1']),env=env)
  for kind in ['guest','api','backup','restore']:
   if kind in state:continue
   image=REPO+':guest-'+kind+'-'+uuid.uuid4().hex[:12]
   if kind=='guest':
    checked(['docker','build','--platform','linux/arm64','-f',str(P/'guest-documents/runtime/Dockerfile'),'-t',image,str(P)],env=env)
   else:
    ctx=root/kind;ctx.mkdir();folder=ctx/'migrations';folder.mkdir();shutil.copy2(sql,folder/'010-guest-documents.sql');save(folder/'manifest.json',manifest)
    if catalog:
     for file,name in [('schema.sql','011-guest-catalog.sql'),('restore-stable.sql','012-catalog-restore-stable.sql')]:shutil.copy2(P/'guest-documents/catalog'/file,folder/name)
    if signing:shutil.copy2(P/'guest-documents/signing/delivery.sql',folder/'013-document-delivery.sql')
    dest=('/boundary' if kind=='api' else '/app')+'/deployment/'
    dockerfile='FROM '+bases[kind]+'\nCOPY migrations/ '+dest+'supabase/managed-atrium/migrations/\n'
    if kind=='backup':
     for name in ['capture.mjs','capture-core.mjs']:
      shutil.copy2(P/'deployment/backup'/name,ctx/name);dockerfile+='COPY '+name+' '+dest+'backup/'+name+'\n'
     if signing:
      shutil.copy2(P/'deployment/storage/client.mjs',ctx/'storage-client.mjs');dockerfile+='COPY storage-client.mjs '+dest+'storage/client.mjs\n'
    for f in ctx.rglob('*'):
     if f.is_file():f.chmod(0o444)
    (ctx/'Dockerfile').write_text(dockerfile)
    checked(['docker','build','--platform','linux/arm64','-t',image,str(ctx)],env=env)
   folder=('/boundary' if kind=='api' else '/app')+'/deployment/supabase/managed-atrium/migrations/'
   verify="const fs=require('fs'),c=require('crypto'),p="+json.dumps(folder)+";const m=JSON.parse(fs.readFileSync(p+'manifest.json'));if(m.migrations.length!=="+str(len(manifest['migrations']))+")throw Error('Manifest count');for(const f of m.migrations)if(c.createHash('sha256').update(fs.readFileSync(p+f.name)).digest('hex')!==f.sha256)throw Error('Migration checksum');"
   checked(['docker','run','--rm','--network','none','--entrypoint','/usr/local/bin/bun' if kind=='api' else 'node',image,'-e',verify],env=env)
   checked(['docker','push',image],env=env)
   digest=aws('ecr','describe-images','--repository-name',REPO.split('/')[-1],'--image-ids','imageTag='+image.split(':')[-1])['imageDetails'][0]['imageDigest']
   state[kind]=REPO+'@'+digest;save(OUT/'images.json',state);print('Staging '+kind+' image published',flush=True)
 save(OUT/'image-sources.json',{'bases':bases,'guestMigrationSha256':manifest['migrations'][-1]['sha256']})


def web():
 p=OUT/'web.json'
 if p.exists():
  d=load(p);r=legacy.c.vercel('/v13/deployments/'+d['id']);d['readyState']=r['readyState'];save(p,d);print('Staging frontend '+d['readyState'],flush=True);return
 sys.path.insert(0,str(P/'deployment/web-app'))
 builder=module('live_web_prepare',P/'deployment/web-app/prepare.py');ui=module('guest_ui',P/'guest-documents/web/prepare.py')
 with tempfile.TemporaryDirectory(prefix='growthcast-guest-web-') as td:
  root=Path(td);source=builder.prepare(root);ui.apply(root/'apps/web')
  save(root/'.vercel/project.json',{'projectId':legacy.CONFIG['staging']['project'],'orgId':legacy.c.v.TEAM})
  result=checked(['docker','run','--rm','-v',str(Path.home()/'Library/Application Support/com.vercel.cli')+':/root/.local/share/com.vercel.cli','-v',td+':/app','-w','/app','-e','VERCEL_TELEMETRY_DISABLED=1','growthcast-vercel-cli','deploy','--yes','--scope','b2b-saas','--target','preview','--no-wait','--format','json'])
  r=json.loads(result);save(p,{k:r.get(k) for k in ['id','url','readyState','target']});save(OUT/'web-source.json',source)
 print('Staging frontend submitted; live domain unchanged',flush=True)

if __name__=='__main__':
 {'inventory':lambda:legacy.inventory('staging'),'baseline':lambda:legacy.baseline('staging'),'poll':lambda:legacy.poll('staging'),'images':images,'web':web}[sys.argv[1]]()
