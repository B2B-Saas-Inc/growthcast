"""Derive production images from accepted digests with explicit identity-only overlays."""
from common import *
import hashlib,shutil,tempfile,uuid
s=load(PRIVATE/'settings.json');f=load(R/'foundation-resources.json');pins=load(R/'secret-pins.json')
ref=s['projectRef'];assert ref!=SOURCE
base_api=load(R/'api-base.json')['image'] if (R/'api-base.json').exists() else load(D/'https-ingress/foundation.json')['Resources']['Task']['Properties']['ContainerDefinitions'][0]['Image']
backup_task=aws('ecs','describe-task-definition','--task-definition','growthcast-portal-staging-backup')['taskDefinition']
base_backup=backup_task['containerDefinitions'][0]['image']
base_restore=load(D/'backup/restore-worker/deployment.json')['image'];base_monitor=load(D/'backup/verification/monitor-deployment.json')['image']
oldkey=load(D/'backup/job/configuration.json')['keyArn']
replacements={SOURCE:ref,'1ee8ab05-20bc-45de-97ed-82a010087cd8':s['writer']['subject'],'465b0e94-dce5-4102-9d83-437a6465b4c5':s['reader']['subject'],oldkey:f['RestoreKeyArn'],'staging':'production'}
files=['runtime-connections/deliver.mjs','backup/capture.mjs','backup/job/core.mjs','backup/job/main.mjs','backup/restore-worker/cloud.mjs','backup/restore-worker/cloud-core.mjs','backup/verification/records.mjs','backup/verification/monitor.mjs','managed-recovery/verify.mjs','backup/restore-objects.mjs']
with tempfile.TemporaryDirectory(prefix='growthcast-production-build-') as td:
 root=Path(td);(root/'.dockerignore').write_text('auth/\n')
 for name in files:
  raw=(D/name).read_text()
  for old,new in replacements.items():raw=raw.replace(old,new)
  if name=='backup/verification/records.mjs':raw=raw.replace('ageHours<=30','ageHours<=1').replace('ageHours>30','ageHours>1')
  p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(raw)
 for name,obj in [('runtime-secrets/runtime-pins.json',{'atrium':{**pins['runtime'],'uid':1000}}),('runtime-connections/pins.json',{'atrium':pins['connection']}),('backup/job/configuration.json',{'secretArn':f['BackupSecretArn'],'bucket':f['Bucket'],'keyArn':f['RestoreKeyArn']})]:
  p=root/name;p.parent.mkdir(parents=True,exist_ok=True);save(p,obj)
 for p in root.rglob('*'):
  if p.is_file():p.chmod(0o444)
 # Retain a reviewable manifest of precisely transformed files, not generated credentials.
 save(R/'image-overlay.json',{'baseImages':{'api':base_api,'backup':base_backup,'restore':base_restore,'monitor':base_monitor},'files':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()},'projectRef':ref,'independentStorageSubjects':True})
 copies={'api':['runtime-connections/deliver.mjs','runtime-connections/pins.json','runtime-secrets/runtime-pins.json'], 'backup':['backup/capture.mjs','backup/job/core.mjs','backup/job/main.mjs','backup/job/configuration.json'],'restore':['backup/restore-worker/cloud.mjs','backup/restore-worker/cloud-core.mjs','backup/verification/records.mjs','managed-recovery/verify.mjs','backup/restore-objects.mjs'],'monitor':['backup/verification/monitor.mjs','backup/verification/records.mjs']}
 bases={'api':base_api,'backup':base_backup,'restore':base_restore,'monitor':base_monitor}
 context=json.loads(checked(['docker','context','inspect']))[0]
 env=os.environ.copy();env.pop('DOCKER_CONTEXT',None);env['DOCKER_CONFIG']=str(root/'auth');env['DOCKER_HOST']=context['Endpoints']['docker']['Host'];Path(env['DOCKER_CONFIG']).mkdir()
 password=checked(['aws','ecr','get-login-password','--region','us-east-1'])
 checked(['docker','login',f['Repository'].split('/')[0],'--username','AWS','--password-stdin'],input=password,env=env)
 images=load(R/'images.json') if (R/'images.json').exists() else {}
 for kind,names in copies.items():
  if kind in images:continue
  dest='/boundary/deployment/' if kind=='api' else '/app/deployment/'
  dockerfile='FROM '+bases[kind]+'\n'+''.join('COPY '+name+' '+dest+name+'\n' for name in names)
  (root/'Dockerfile').write_text(dockerfile);tag=kind+'-'+uuid.uuid4().hex;image=f['Repository']+':'+tag
  result=subprocess.run(['docker','build','--platform','linux/arm64','-t',image,str(root)],capture_output=True,text=True,env=env)
  if result.returncode:
   print(result.stderr[-1800:]);raise RuntimeError('Image build failed')
  checked(['docker','push',image],env=env)
  digest=aws('ecr','describe-images','--repository-name','growthcast-portal-production','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
  images[kind]=f['Repository']+'@'+digest;save(R/'images.json',images);print('Production '+kind+' image built and pinned.',flush=True)
