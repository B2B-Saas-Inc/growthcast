"""Copy a consistent, read-only staging snapshot into the empty production project."""
from common import *
import hashlib,secrets,shutil,urllib.parse
ref=load(R/'database.json')['projectRef'];assert ref!=SOURCE
snapshot=PRIVATE/'migration-snapshot';snapshot.mkdir(exist_ok=True)
source=PRIVATE/'capture-source';source.mkdir(exist_ok=True)
if not (R/'capture.json').exists():
 cfg=load(D/'backup/job/configuration.json');b=json.loads(aws('secretsmanager','get-secret-value','--secret-id',cfg['secretArn'])['SecretString'])
 for name,value in [('database-url',b['databaseUrl']),('prod-ca-2021.crt',b['databaseCaCert']),('storage-credentials.json',json.dumps(b['storageCredentials']))]:(source/name).write_text(value)
 raw=checked(['docker','run','--rm','--user','root','--entrypoint','node','-v',str(D)+':/app/deployment:ro','-v',str(source)+':/source:ro','-v',str(snapshot)+':/snapshot','growthcast-backup-job','/app/deployment/backup/capture.mjs'])
 save(R/'capture.json',json.loads(raw));print('Consistent staging snapshot captured; source data unchanged.',flush=True)
 shutil.rmtree(source)
settings_path=PRIVATE/'settings.json'
if not settings_path.exists():
 supa('/v1/projects/'+ref+'/ssl-enforcement',{'requestedConfig':{'database':True}},'PUT')
 supa('/v1/projects/'+ref+'/api-keys/legacy?enabled=false',method='PUT')
 signing=supa('/v1/projects/'+ref+'/config/auth/signing-keys')['keys']
 if not any(k.get('algorithm')=='ES256' and k.get('status')=='in_use' for k in signing):supa('/v1/projects/'+ref+'/config/auth/signing-keys',{'algorithm':'ES256','status':'in_use'})
 legacy=supa('/v1/projects/'+ref+'/config/auth/signing-keys/legacy')
 if legacy.get('id'):supa('/v1/projects/'+ref+'/config/auth/signing-keys/'+legacy['id'],{'status':'revoked'},'PATCH')
 pool=next(p for p in supa('/v1/projects/'+ref+'/config/database/pooler') if p['database_type']=='PRIMARY')
 settings={'intent':'production-initial-migration','projectRef':ref,'databaseUrl':'postgresql://'+urllib.parse.quote(pool['db_user'],safe='')+':'+urllib.parse.quote((PRIVATE/'database-password').read_text(),safe='')+'@'+pool['db_host']+':5432/postgres?sslmode=verify-full'}
 save(settings_path,settings);shutil.copyfile(Path.home()/'.config/growthcast/portal-staging/prod-ca-2021.crt',PRIVATE/'ca.crt')
settings=load(settings_path)
def container(file,action=None):
 raw=json.dumps(settings).encode();settings_path.write_bytes(raw)
 cmd=['docker','run','--rm','-e','RECOVERY_CONFIG_SHA256='+hashlib.sha256(raw).hexdigest(),'-v',str(D)+':/app/deployment:ro','-v',str(PRIVATE)+':/target:ro','-v',str(snapshot)+':/restored:ro','growthcast-managed-recovery','/app/deployment/production/'+file]
 if action:cmd.append(action)
 r=subprocess.run(cmd,capture_output=True)
 if r.returncode:
  # Target helper prints only a bounded error code/category, never SQL or values.
  if file=='target.mjs':print(r.stderr.decode()[-500:])
  raise RuntimeError('Production migration '+file+' '+str(action)+' failed; raw diagnostics withheld')
 return json.loads(r.stdout.decode().strip().splitlines()[-1])
if not (R/'database-restore.json').exists():
 save(R/'database-restore.json',container('target.mjs','restore'));supa('/v1/projects/'+ref+'/postgrest',{'db_schema':'portal_api'},'PATCH')
 save(R/'database-verify.json',container('target.mjs','verify'));print('All private database records, schema owners and grants match staging snapshot.',flush=True)
if not settings.get('writer'):
 keys=supa('/v1/projects/'+ref+'/api-keys?reveal=true');admin=next(k['api_key'] for k in keys if k['type']=='secret' and k['name']=='default');pub=next(k['api_key'] for k in keys if k['type']=='publishable' and k['name']=='default')
 headers={'apikey':admin,'Content-Type':'application/json'};base='https://'+ref+'.supabase.co'
 http(base+'/storage/v1/bucket',headers,{'id':'gc-atrium-private','name':'gc-atrium-private','public':False,'file_size_limit':3145728},'POST')
 for kind,email in [('writer','portal-storage@growthcast.invalid'),('reader','portal-backup-storage@growthcast.invalid')]:
  pw=secrets.token_hex(32);u=http(base+'/auth/v1/admin/users',headers,{'email':email,'password':pw,'email_confirm':True,'app_metadata':{'purpose':'growthcast-production-'+kind}},'POST')
  settings[kind]={'subject':u['id'],'email':email,'password':pw,'publishableKey':pub,'projectRef':ref,'bucket':'gc-atrium-private'};save(settings_path,settings)
if not (R/'storage-restore.json').exists():
 sql="BEGIN;SELECT set_config('growthcast.storage_subject','"+settings['writer']['subject']+"',true),set_config('growthcast.backup_storage_subject','"+settings['reader']['subject']+"',true);"+(D/'storage/policy.sql').read_text()+(D/'storage/backup-policy.sql').read_text()+"COMMIT;"
 query(ref,sql,False)
 save(R/'storage-restore.json',container('storage.mjs'));print('Private storage migrated with separate service identities and verified object bytes.',flush=True)
