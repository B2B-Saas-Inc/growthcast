"""Independent production Documenso provisioning; never copies staging secret values."""
from pathlib import Path
import sys,json,secrets,tempfile,base64,urllib.parse,os,uuid,copy
import release as r
p=r.legacy;R=r.R;P=r.P;OUT=R/'release/production';ROLE='growthcast-portal-production-documenso-runtime';STACK='growthcast-portal-production-provider-secrets';ACCOUNT='059393269249'
def pinned(pin):return json.loads(p.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
def create_stack(name,t,receipt):
 assert p.aws('sts','get-caller-identity')['Account']==ACCOUNT
 p.save(receipt.with_suffix('.template.json'),t)
 if not receipt.exists():p.save(receipt,p.request(['cloudformation','create-stack'],{'StackName':name,'TemplateBody':json.dumps(t),'Capabilities':['CAPABILITY_NAMED_IAM']}))
 print('Stack requested: '+name,flush=True)
def outputs(name):
 s=p.aws('cloudformation','describe-stacks','--stack-name',name)['Stacks'][0];assert s['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE'],s['StackStatus']
 return {o['OutputKey']:o['OutputValue'] for o in s['Outputs']}
def foundation():
 arn='arn:aws:iam::'+ACCOUNT+':role/'+ROLE;root='arn:aws:iam::'+ACCOUNT+':root'
 resources={'Role':{'Type':'AWS::IAM::Role','Properties':{'RoleName':ROLE,'AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'ecs-tasks.amazonaws.com'},'Action':'sts:AssumeRole','Condition':{'StringEquals':{'aws:SourceAccount':ACCOUNT},'ArnLike':{'aws:SourceArn':'arn:aws:ecs:us-east-1:'+ACCOUNT+':*'}}}]}}},'Key':{'Type':'AWS::KMS::Key','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':{'EnableKeyRotation':True,'KeyPolicy':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'AWS':root},'Action':'kms:*','Resource':'*'},{'Effect':'Deny','Principal':'*','Action':'kms:Decrypt','Resource':'*','Condition':{'ArnNotEquals':{'aws:PrincipalArn':[root,arn]}}},{'Effect':'Deny','Principal':'*','Action':'kms:Decrypt','Resource':'*','Condition':{'ArnEquals':{'aws:PrincipalArn':arn},'StringNotEquals':{'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com'}}}]}}}}
 out={'KeyArn':{'Value':{'Fn::GetAtt':['Key','Arn']}}}
 for kind in ['Runtime','Connection','Certificate','Api']:
  resources[kind]={'Type':'AWS::SecretsManager::Secret','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':{'Name':'growthcast/portal/production/documenso/'+kind.lower(),'KmsKeyId':{'Ref':'Key'}}};out[kind+'Arn']={'Value':{'Ref':kind}}
 resources['Read']={'Type':'AWS::IAM::Policy','Properties':{'PolicyName':'production-provider-private-config','Roles':[{'Ref':'Role'}],'PolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':'secretsmanager:GetSecretValue','Resource':[{'Ref':k} for k in ['Runtime','Connection','Certificate']]},{'Effect':'Allow','Action':'kms:Decrypt','Resource':{'Fn::GetAtt':['Key','Arn']},'Condition':{'StringEquals':{'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com','kms:EncryptionContext:SecretARN':[{'Ref':k} for k in ['Runtime','Connection','Certificate']]}}}]}}}
 create_stack(STACK,{'AWSTemplateFormatVersion':'2010-09-09','Resources':resources,'Outputs':out},OUT/'provider-secrets-stack.json')
def initialize():
 out=outputs(STACK);path=OUT/'provider-pins.json';pins=p.load(path) if path.exists() else {}
 for kind in ['Runtime','Connection','Certificate','Api']:
  desc=p.aws('secretsmanager','describe-secret','--secret-id',out[kind+'Arn']);current=[v for v,s in desc.get('VersionIdsToStages',{}).items() if 'AWSCURRENT' in s]
  if kind in pins:assert current==[pins[kind]['version']]
  else:assert not current,'Unrecorded secret: reconcile before retry'
 def save(kind,value):
  if kind in pins:return
  result=p.request(['secretsmanager','put-secret-value'],{'SecretId':out[kind+'Arn'],'SecretString':json.dumps(value)})
  pins[kind]={'arn':result['ARN'],'version':result['VersionId']};p.save(path,pins)
 save('Runtime',{'schemaVersion':1,'service':'documenso','secrets':{k:secrets.token_hex(32) for k in ['NEXTAUTH_SECRET','NEXT_PRIVATE_ENCRYPTION_KEY','NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY']}})
 app=p.connection('production');url=urllib.parse.urlsplit(app['databaseUrl']);password=secrets.token_hex(32)
 save('Connection',{'schemaVersion':1,'service':'documenso','projectRef':app['projectRef'],'databaseCa':app['databaseCa'],'databaseUrl':urllib.parse.urlunsplit((url.scheme,url.username.replace('gc_app','gc_documenso',1)+':'+password+'@'+url.hostname+':'+str(url.port),url.path,'',''))})
 if 'Certificate' not in pins:
  with tempfile.TemporaryDirectory(prefix='growthcast-production-signing-') as td:
   root=Path(td);(root/'passphrase').write_text(secrets.token_hex(32))
   script="set -eu\nopenssl req -x509 -newkey rsa:3072 -nodes -days 365 -subj '/O=GrowthCast/CN=GrowthCast Document Signing' -addext 'keyUsage=critical,digitalSignature,nonRepudiation' -keyout /work/signing.key -out /work/signing.crt 2>/dev/null\nopenssl pkcs12 -export -out /work/signing.p12 -inkey /work/signing.key -in /work/signing.crt -passout file:/work/passphrase\nopenssl x509 -in /work/signing.crt -noout -fingerprint -sha256 -enddate"
   identity=p.checked(['docker','run','--rm','--network','none','--user','0','--entrypoint','sh','-v',td+':/work','growthcast-documenso-runtime','-c',script]).decode()
   save('Certificate',{'schemaVersion':1,'purpose':'production-document-signing-only','p12':base64.b64encode((root/'signing.p12').read_bytes()).decode(),'passphrase':(root/'passphrase').read_text()})
   p.save(OUT/'signing-certificate.json',{'pin':pins['Certificate'],'identity':identity.splitlines(),'selfSigned':True,'separateFromHttps':True})
 save('Api',{'purpose':'production-portal-signing-api','token':'api_'+secrets.token_hex(24)})
 role=OUT/'provider-role.json'
 if not role.exists():
  connection=pinned(pins['Connection']);password=urllib.parse.urlsplit(connection['databaseUrl']).password;assert len(password)==64
  sql="DO $$ BEGIN IF EXISTS(SELECT 1 FROM gc_documenso.\"Envelope\") THEN RAISE EXCEPTION 'Existing provider envelopes'; END IF; ALTER ROLE gc_documenso LOGIN PASSWORD '"+password+"' VALID UNTIL 'infinity'; END $$;"
  p.c.supa('/v1/projects/mdjldxussxdtcjxsoesr/database/query',{'query':sql,'read_only':False});p.save(role,{'role':'gc_documenso','login':True,'version':pins['Connection']['version']})
 print('Independent production provider credentials initialized',flush=True)
def transform(raw):return raw.replace('saedetvoolpdysiyjwvg','mdjldxussxdtcjxsoesr').replace('clients.staging.growthcast.app','clients.growthcast.app').replace('staging','production')
def publish(ctx,label):
 repo='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-production';tag=label+'-'+uuid.uuid4().hex[:12];image=repo+':'+tag
 with tempfile.TemporaryDirectory(prefix='gc-docker-auth-') as auth:
  context=json.loads(p.checked(['docker','context','inspect']))[0];env={**os.environ,'DOCKER_CONFIG':auth,'DOCKER_HOST':context['Endpoints']['docker']['Host']};env.pop('DOCKER_CONTEXT',None)
  p.checked(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=p.checked(['aws','ecr','get-login-password','--region','us-east-1']),env=env)
  p.checked(['docker','build','--platform','linux/arm64','-t',image,str(ctx)],env=env);p.checked(['docker','push',image],env=env)
 digest=p.aws('ecr','describe-images','--repository-name','growthcast-portal-production','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest'];return repo+'@'+digest
def image():
 path=OUT/'provider-image.json'
 if path.exists():return
 pins=p.load(OUT/'provider-pins.json');base=p.load(P/'deployment/phase-2-closeout/documenso-image.json')['image']
 with tempfile.TemporaryDirectory(prefix='gc-provider-build-') as td:
  root=Path(td);files={
   '/boundary/provider-start.mjs':transform((R.parent/'signing-service/provider-start.mjs').read_text()),
   '/boundary/deployment/runtime-connections/deliver.mjs':transform((P/'deployment/runtime-connections/deliver.mjs').read_text()),
   '/boundary/signing-certificate-pin.json':json.dumps(pins['Certificate']),
   '/boundary/deployment/runtime-secrets/runtime-pins.json':json.dumps({'documenso':{**pins['Runtime'],'uid':1001}}),
   '/boundary/deployment/runtime-connections/pins.json':json.dumps({'documenso':pins['Connection']})}
  docker='FROM '+base+'\n'
  for i,(dest,raw) in enumerate(files.items()):
   f=root/str(i);f.write_text(raw);f.chmod(0o444);docker+='COPY --chown=1001:65533 '+str(i)+' '+dest+'\n'
  docker+='ENTRYPOINT ["/usr/local/bin/node","/boundary/provider-start.mjs"]\nCMD []\n';(root/'Dockerfile').write_text(docker)
  p.save(path,{'image':publish(root,'production-signing-provider'),'base':base})
 print('Production provider image published',flush=True)
def network():
 before=p.load(OUT/'before-api.json');t=before['template']['Resources'];svc=p.aws('ecs','describe-services','--cluster','growthcast-portal-production-api','--services','growthcast-portal-production-api')['services'][0];vpc=p.aws('ec2','describe-security-groups','--group-ids',before['outputs']['ApiSecurityGroup'])['SecurityGroups'][0]['VpcId']
 lb=p.aws('elbv2','describe-load-balancers','--load-balancer-arns',before['outputs']['LoadBalancerArn'])['LoadBalancers'][0]
 n={'ApiSecurityGroup':before['outputs']['ApiSecurityGroup'],'Cluster':'growthcast-portal-production-api','LoadBalancerSecurityGroup':lb['SecurityGroups'][0],'Subnet0':svc['networkConfiguration']['awsvpcConfiguration']['subnets'][0],'Subnet1':svc['networkConfiguration']['awsvpcConfiguration']['subnets'][1],'Vpc':vpc};p.save(OUT/'network.json',n);return n

def deploy():
 n=network();old=p.load(R.parent/'signing-service/network.json');raw=json.dumps(p.load(R.parent/'signing-service/template.json'))
 for key,value in old.items():raw=raw.replace(value,n[key])
 raw=transform(raw).replace('growthcast-portal-production-backup-execution','growthcast-portal-production-execution')
 t=json.loads(raw);task=t['Resources']['Task']['Properties'];task['ContainerDefinitions'][0]['Image']=p.load(OUT/'provider-image.json')['image'];task['ExecutionRoleArn']='arn:aws:iam::'+ACCOUNT+':role/growthcast-portal-production-execution'
 policy={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['logs:CreateLogStream','logs:PutLogEvents'],'Resource':'arn:aws:logs:us-east-1:'+ACCOUNT+':log-group:/growthcast/portal/production/signing-provider:*'}]}
 p.request(['iam','put-role-policy'],{'RoleName':'growthcast-portal-production-execution','PolicyName':'production-signing-logs','PolicyDocument':json.dumps(policy)})
 create_stack('growthcast-portal-production-signing-provider',t,OUT/'provider-stack.json')
def bootstrap():
 pins=p.load(OUT/'provider-pins.json');image=p.load(OUT/'provider-image.json')['image']
 with tempfile.TemporaryDirectory(prefix='gc-provider-bootstrap-') as td:
  f=Path(td)/'bootstrap.mjs';f.write_text(transform((R.parent/'signing-service/bootstrap-provider.mjs').read_text()));f.chmod(0o444)
  result=p.checked(['docker','run','--rm','-i','--read-only','--user','1001:65533','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1001,gid=65533,mode=700','-v',str(f)+':/bootstrap.mjs:ro','--entrypoint','/usr/local/bin/node',image,'/bootstrap.mjs'],input=json.dumps({'connection':pinned(pins['Connection']),'credential':pinned(pins['Api'])}).encode())
  p.save(OUT/'provider-identity.json',json.loads(result))
 print('Production provider identity commissioned without email',flush=True)
if __name__=='__main__':{'foundation':foundation,'initialize':initialize,'image':image,'deploy':deploy,'bootstrap':bootstrap}[sys.argv[1]]()
