"""Reproducible production identity overlays on accepted staging/application digests."""
from pathlib import Path
import sys,json,tempfile,hashlib,re
import provider as q
p=q.p;P=q.P;OUT=q.OUT

def build():
 images=p.load(OUT/'images.json') if (OUT/'images.json').exists() else {}
 stage=p.template('growthcast-portal-staging-api')['Resources']['Task']['Properties']['ContainerDefinitions'];base_api=next(c['Image'] for c in stage if c['Name']=='api')
 base_guest=p.load(P/'guest-documents/deployment/expiry-rollout/release/staging/gateway-image.json')['image']
 workflow=json.dumps(p.load(OUT/'before-recovery.json')['template']);bases={'api':base_api,'guest':base_guest}
 for kind in ['backup','restore']:
  refs=set(re.findall(r'arn:aws:ecs:us-east-1:059393269249:task-definition/growthcast-portal-production-'+kind+r':\d+',workflow));assert len(refs)==1
  bases[kind]=p.aws('ecs','describe-task-definition','--task-definition',refs.pop())['taskDefinition']['containerDefinitions'][0]['image']
 pins=p.load(P/'deployment/production/secret-pins.json');settings=p.load(p.c.PRIVATE/'settings.json');team=p.load(OUT/'provider-identity.json')['teamId']
 for kind in ['api','guest','backup','restore']:
  if kind in images:continue
  files={}
  if kind=='api':
   files['/boundary/deployment/runtime-connections/deliver.mjs']=q.transform((P/'deployment/runtime-connections/deliver.mjs').read_text()).replace('1ee8ab05-20bc-45de-97ed-82a010087cd8',settings['writer']['subject'])
   files['/boundary/deployment/runtime-connections/pins.json']=json.dumps({'atrium':pins['connection']})
   files['/boundary/deployment/runtime-secrets/runtime-pins.json']=json.dumps({'atrium':{**pins['runtime'],'uid':1000}})
  if kind=='guest':
   for rel in ['runtime/config.mjs','runtime/gateway-start.mjs','runtime/lifecycle-start.mjs','runtime/start.mjs','runtime/signing-start.mjs','runtime/signing-secrets.mjs','runtime/migrate-live.mjs','signing/managed-store.mjs','signing/managed-delivery.mjs','signing/provider-api.mjs']:
    raw=q.transform((P/'guest-documents'/rel).read_text())
    if rel=='runtime/gateway-start.mjs':raw=raw.replace('/api/branding/logo/team/3','/api/branding/logo/team/'+str(team))
    files['/app/guest-documents/'+rel]=raw
   files['/app/signing-pins.json']=json.dumps(p.load(OUT/'signing-secrets/pins.json'))
  if kind in ['backup','restore']:
   selected=['storage/client.mjs','managed-recovery/catalog.mjs']+(['backup/capture.mjs','backup/capture-core.mjs'] if kind=='backup' else ['managed-recovery/verify.mjs'])
   for rel in selected:
    raw=q.transform((P/'deployment'/rel).read_text()).replace('465b0e94-dce5-4102-9d83-437a6465b4c5',settings['reader']['subject'])
    files['/app/deployment/'+rel]=raw
  migration_dest=('/boundary' if kind=='api' else '/app')+'/deployment/supabase/managed-atrium/migrations/'
  manifest=p.load(P/'deployment/supabase/managed-atrium/migrations/manifest.json');assert len(manifest['migrations'])==9
  for m in manifest['migrations']:files[migration_dest+m['name']]=(P/'deployment/supabase/managed-atrium/migrations'/m['name']).read_text()
  for rel,name in [('schema.sql','010-guest-documents.sql'),('catalog/schema.sql','011-guest-catalog.sql'),('catalog/restore-stable.sql','012-catalog-restore-stable.sql'),('signing/delivery.sql','013-document-delivery.sql')]:
   raw=(P/'guest-documents'/rel).read_text();files[migration_dest+name]=raw;manifest['migrations'].append({'name':name,'sha256':hashlib.sha256(raw.encode()).hexdigest()})
  files[migration_dest+'manifest.json']=json.dumps(manifest)
  with tempfile.TemporaryDirectory(prefix='gc-production-'+kind+'-') as td:
   root=Path(td);docker='FROM '+bases[kind]+'\n'
   for i,(dest,raw) in enumerate(files.items()):
    f=root/str(i);f.write_text(raw);f.chmod(0o444);docker+='COPY '+str(i)+' '+dest+'\n'
   # Build fails if any migration bytes, permissions or count differ.
   check="const f=require('fs'),c=require('crypto'),p="+json.dumps(migration_dest)+";const m=JSON.parse(f.readFileSync(p+'manifest.json'));if(m.migrations.length!==13)throw Error('Manifest');for(const x of m.migrations)if(c.createHash('sha256').update(f.readFileSync(p+x.name)).digest('hex')!==x.sha256)throw Error('Checksum');"
   docker+='RUN '+('/usr/local/bin/bun' if kind=='api' else 'node')+' -e '+"'"+check.replace("'","'\\''")+"'\n"
   (root/'Dockerfile').write_text(docker);images[kind]=q.publish(root,'documents-'+kind);p.save(OUT/'images.json',images)
   p.save(OUT/(kind+'-overlay.json'),{'base':bases[kind],'image':images[kind],'files':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in files.items()},'manifest':manifest})
  print('Production '+kind+' image published and migration checks passed',flush=True)
if __name__=='__main__':build()
