from common import *
import secrets,urllib.parse
assert not (R/'identity-evidence.json').exists(),'Identity cutover is one-shot; reconcile before retry'
s=load(PRIVATE/'settings.json');resources=load(R/'foundation-resources.json');ref=s['projectRef']
pin=load(D/'runtime-secrets/runtime-pins.json')['atrium'];old=json.loads(aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
identity={'old':old['secrets']['BETTER_AUTH_SECRET'],'runtime':{'schemaVersion':1,'service':'atrium','secrets':{k:secrets.token_hex(32) for k in ['BETTER_AUTH_SECRET','PORTAL_API_ORIGIN']}},'passwords':{r:secrets.token_hex(32) for r in ['gc_app','gc_documenso','gc_backup']}}
save(PRIVATE/'identity.json',identity)
base=load(D/'https-ingress/foundation.json')['Resources']['Task']['Properties']['ContainerDefinitions'][0]['Image']
r=checked(['docker','run','--rm','--user','root','--entrypoint','/usr/local/bin/bun','-e','SENTRY_ENABLED=false','-v',str(PRIVATE)+':/private:ro','-v',str(R)+':/release:ro',base,'/release/identity.mjs'])
save(R/'identity-evidence.json',json.loads(r));print('Encrypted settings preserved under independent production key; passwords unchanged.',flush=True)
url=urllib.parse.urlparse(s['databaseUrl']);ca=(PRIVATE/'ca.crt').read_text()
def dburl(role):return 'postgresql://'+role+'.'+ref+':'+identity['passwords'][role]+'@'+url.hostname+':5432/postgres'
connection={'schemaVersion':1,'service':'atrium','projectRef':ref,'databaseUrl':dburl('gc_app'),'databaseCa':ca,'storage':s['writer']}
backup={'schemaVersion':2,'projectRef':ref,'role':'gc_backup','databaseUrl':dburl('gc_backup'),'databaseCaCert':ca,'storageCredentials':s['reader']}
pins={}
for name,value in [('Runtime',identity['runtime']),('Connection',connection),('Backup',backup)]:
 arn=resources[name+'SecretArn'];assert not aws('secretsmanager','describe-secret','--secret-id',arn).get('VersionIdsToStages')
 response=aws_request(['secretsmanager','put-secret-value'],{'SecretId':arn,'SecretString':json.dumps(value)})
 assert json.loads(aws('secretsmanager','get-secret-value','--secret-id',arn,'--version-id',response['VersionId'])['SecretString'])==value
 pins[name.lower()]={'arn':arn,'version':response['VersionId']}
save(R/'secret-pins.json',pins)
# Backup role already exists from the restored ACLs; provision only its separate metadata view and defaults.
sql=(D/'backup/provision.sql').read_text();sql=sql[sql.index('ALTER ROLE gc_backup SET'):]
query(ref,'BEGIN;'+sql+"ALTER ROLE gc_backup LOGIN;COMMIT;",False)
print('Production-only version-pinned runtime, connection and read-only backup secrets stored.',flush=True)
