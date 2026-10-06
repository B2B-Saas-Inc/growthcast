"""Staging-only signing credential boundary. Never prints secret values."""
from pathlib import Path
import sys,json,time,secrets,urllib.parse,tempfile,subprocess,re,os
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare as p
R=Path(__file__).resolve().parent;STACK='growthcast-portal-staging-signing-secrets'
ACCOUNT='059393269249';PROJECT='saedetvoolpdysiyjwvg'
ROLES={'delivery':'growthcast-portal-staging-atrium-runtime','gateway':'growthcast-portal-staging-signing-gateway','lifecycle':'growthcast-portal-staging-signing-lifecycle'}
def template():
 arn=lambda role:'arn:aws:iam::'+ACCOUNT+':role/'+role
 ref=lambda name:{'Ref':name}
 roles=[arn(x) for x in ROLES.values()]
 resources={}
 for kind in ['gateway','lifecycle']:
  resources[kind.title()+'Role']={'Type':'AWS::IAM::Role','Properties':{'RoleName':ROLES[kind],'AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'ecs-tasks.amazonaws.com'},'Action':'sts:AssumeRole','Condition':{'StringEquals':{'aws:SourceAccount':ACCOUNT},'ArnLike':{'aws:SourceArn':'arn:aws:ecs:us-east-1:'+ACCOUNT+':*'}}}]}}}
 resources['Key']={'Type':'AWS::KMS::Key','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':{'Description':'Staging portal delivery and role-separated signing credentials','EnableKeyRotation':True,'KeyPolicy':{'Version':'2012-10-17','Statement':[
  {'Sid':'Administration','Effect':'Allow','Principal':{'AWS':'arn:aws:iam::'+ACCOUNT+':root'},'Action':'kms:*','Resource':'*'},
  {'Sid':'ExcludeUnrelatedReaders','Effect':'Deny','Principal':'*','Action':'kms:Decrypt','Resource':'*','Condition':{'ArnNotEquals':{'aws:PrincipalArn':['arn:aws:iam::'+ACCOUNT+':root',*roles]}}},
  {'Sid':'RuntimeOnlyViaSecretsManager','Effect':'Deny','Principal':'*','Action':'kms:Decrypt','Resource':'*','Condition':{'ArnEquals':{'aws:PrincipalArn':roles},'StringNotEquals':{'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com'}}}
 ]}}}
 outputs={}
 for kind in ROLES:
  title=kind.title();secret=title+'Secret'
  resources[secret]={'Type':'AWS::SecretsManager::Secret','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':{'Name':'growthcast/portal/staging/signing/'+kind,'KmsKeyId':ref('Key'),'Description':'Private '+kind+' configuration; staging only'}}
  resources[title+'Read']={'Type':'AWS::IAM::Policy',**({'DependsOn':title+'Role'} if kind!='delivery' else {}),'Properties':{'PolicyName':'growthcast-staging-signing-'+kind,'Roles':[ROLES[kind]],'PolicyDocument':{'Version':'2012-10-17','Statement':[
   {'Effect':'Allow','Action':['secretsmanager:GetSecretValue'],'Resource':ref(secret)},
   {'Effect':'Allow','Action':['kms:Decrypt'],'Resource':{'Fn::GetAtt':['Key','Arn']},'Condition':{'StringEquals':{'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com','kms:EncryptionContext:SecretARN':ref(secret)}}}
  ]}}}
  outputs[title+'SecretArn']={'Value':ref(secret)}
 outputs['KeyArn']={'Value':{'Fn::GetAtt':['Key','Arn']}}
 result={'AWSTemplateFormatVersion':'2010-09-09','Description':'Separate staging signing credential delivery; no service or database login enabled.','Resources':resources,'Outputs':outputs}
 p.save(R/'template.json',result);return result
def deploy():
 assert p.aws('sts','get-caller-identity')['Account']==ACCOUNT
 t=template()
 if not (R/'stack.json').exists():
  p.save(R/'stack.json',p.legacy.request(['cloudformation','create-stack'],{'StackName':STACK,'TemplateBody':json.dumps(t),'Capabilities':['CAPABILITY_NAMED_IAM']}))
 for _ in range(100):
  stack=p.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
  if stack['StackStatus']=='CREATE_COMPLETE':
   p.save(R/'deployment.json',{'at':p.legacy.c.now(),'outputs':{x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}});print('Separate staging signing credential boundary deployed',flush=True);return
  if 'ROLLBACK' in stack['StackStatus'] or 'FAILED' in stack['StackStatus']:raise RuntimeError('Signing credential stack requires reconciliation')
  time.sleep(5)
 print('Stack pending; resume deploy to poll',flush=True)
def pinned(path,kind=None):
 pin=p.load(path);pin=pin[kind] if kind else pin
 return json.loads(p.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
def initialize():
 assert p.aws('sts','get-caller-identity')['Account']==ACCOUNT
 outputs=p.load(R/'deployment.json')['outputs'];pins=p.load(R/'pins.json') if (R/'pins.json').exists() else {}
 # Refuse an unrecorded current value; never silently rotate credentials on retry.
 for kind in ROLES:
  desc=p.aws('secretsmanager','describe-secret','--secret-id',outputs[kind.title()+'SecretArn'])
  current=[version for version,stages in desc.get('VersionIdsToStages',{}).items() if 'AWSCURRENT' in stages]
  if kind in pins:assert current==[pins[kind]['version']]
  elif current:raise RuntimeError('Unrecorded credential version requires reconciliation')
 source=pinned(p.P/'deployment/runtime-connections/pins.json','atrium')
 token=pinned(R.parent/'signing-service/provider-api-pin.json')['token']
 team=p.load(R.parent/'signing-service/provider-identity.json')['teamId']
 query=lambda sql,read=True:p.legacy.c.supa('/v1/projects/'+PROJECT+'/database/query',{'query':sql,'read_only':read})
 orgs=query('''SELECT DISTINCT s."organizationId" AS id FROM gc_atrium.system_settings s JOIN gc_atrium.member m ON m."organizationId"=s."organizationId" JOIN gc_atrium."user" u ON u.id=m."userId" WHERE u.email='ewhite@growthcast.app' AND u."emailVerified" AND m.role IN ('owner','admin') AND s."emailFrom"='clients@growthcast.app' ''')
 assert len(orgs)==1
 delivery=pinned(R/'pins.json','delivery') if 'delivery' in pins else {'organizationId':orgs[0]['id'],'teamId':team,'providerToken':token,'encryptionKey':secrets.token_hex(32)}
 def save_secret(kind,value):
  if kind in pins:return
  response=p.legacy.request(['secretsmanager','put-secret-value'],{'SecretId':outputs[kind.title()+'SecretArn'],'SecretString':json.dumps(value)})
  pins[kind]={'arn':response['ARN'],'version':response['VersionId'],'role':ROLES[kind],'uid':1000};p.save(R/'pins.json',pins)
 save_secret('delivery',delivery)
 for kind,role in [('gateway','gc_gateway'),('lifecycle','gc_lifecycle')]:
  if kind in pins:continue
  state=query("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+role+"'");assert state==[{'rolcanlogin':False}]
  password=secrets.token_hex(32);url=urllib.parse.urlsplit(source['databaseUrl']);user=url.username.replace('gc_app',role,1)
  connection={'url':urllib.parse.urlunsplit((url.scheme,user+':'+password+'@'+url.hostname+(':'+str(url.port) if url.port else ''),url.path,'','')),'ca':source['databaseCa'],'projectRef':PROJECT,'environment':'staging'}
  if kind=='gateway':value=connection
  else:
   cert=pinned(p.P/'deployment/phase-2-closeout/certificate.json');assert cert['purpose']=='staging-document-signing-only'
   import base64
   with tempfile.TemporaryDirectory(prefix='growthcast-trust-') as td:
    root=Path(td);(root/'certificate.p12').write_bytes(base64.b64decode(cert['p12']));(root/'pass').write_text(cert['passphrase']);os.chmod(root/'certificate.p12',0o600);os.chmod(root/'pass',0o600)
    pem=p.checked(['docker','run','--rm','--network','none','--user','0','-v',td+':/private:ro','--entrypoint','openssl','growthcast-guest-runtime','pkcs12','-in','/private/certificate.p12','-passin','file:/private/pass','-nokeys']).decode()
   trust=re.search(r'-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----',pem).group(0)+'\n'
   value={'config':{'connection':connection,'providerToken':token,'teamId':team,'encryptionKey':delivery['encryptionKey'],'storageConfiguration':{'projectRef':PROJECT,'bucket':'gc-atrium-private','credentials':source['storage']}},'trustPem':trust}
  # Persist first so the same password can be recovered after an interrupted SQL call.
  save_secret(kind,value)
 for kind,role in [('gateway','gc_gateway'),('lifecycle','gc_lifecycle')]:
  if (R/(kind+'-database.json')).exists():
   assert p.load(R/(kind+'-database.json'))['credentialVersion']==pins[kind]['version'];continue
  state=query("SELECT rolcanlogin FROM pg_roles WHERE rolname='"+role+"'");assert state==[{'rolcanlogin':False}]
  value=pinned(R/'pins.json',kind);connection=value if kind=='gateway' else value['config']['connection']
  password=urllib.parse.urlsplit(connection['url']).password;assert re.fullmatch('[a-f0-9]{64}',password)
  query("ALTER ROLE "+role+" NOLOGIN PASSWORD '"+password+"'",False)
  p.save(R/(kind+'-database.json'),{'role':role,'login':False,'credentialVersion':pins[kind]['version'],'at':p.legacy.c.now()})
 print('Signing configurations stored; gateway and lifecycle database logins remain disabled',flush=True)
if __name__=='__main__':{'template':template,'deploy':deploy,'initialize':initialize}[sys.argv[1]]()
