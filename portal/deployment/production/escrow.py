"""Archive and recover exact production secret versions under a separate scoped reader."""
from common import *
import base64,hashlib,tempfile,uuid
f=load(R/'foundation-resources.json');pins=load(R/'secret-pins.json')
if not (R/'escrow-resources.json').exists():
 template=load(D/'phase-2-closeout/foundation.json');rs={k:v for k,v in template['Resources'].items() if k in ['EscrowReader','EscrowAccess','EscrowBroker','EscrowBrokerAccess']}
 rs=json.loads(json.dumps(rs).replace('staging','production'))
 rs['EscrowAccess']['Properties']['PolicyDocument']['Statement'][1]['Resource']=f['RuntimeKeyArn']
 t={'AWSTemplateFormatVersion':'2010-09-09','Resources':rs,'Outputs':{'RoleArn':{'Value':{'Fn::GetAtt':['EscrowReader','Arn']}},'Broker':{'Value':{'Ref':'EscrowBroker'}}}}
 save(R/'escrow-foundation.json',t);save(R/'escrow-resources.json',a.create_stack('growthcast-portal-production-secret-escrow',t))
e=load(R/'escrow-resources.json');assert not (R/'escrow-evidence.json').exists()
with tempfile.TemporaryDirectory(prefix='growthcast-production-escrow-') as tmp:
 d=Path(tmp);bundle={k:aws('secretsmanager','get-secret-value','--secret-id',v['arn'],'--version-id',v['version'])['SecretString'] for k,v in pins.items()}
 raw=json.dumps(bundle).encode();expected=hashlib.sha256(raw).hexdigest();(d/'plain').write_bytes(raw)
 key='runtime-escrow/production/'+uuid.uuid4().hex+'/archive.bin';context={'purpose':'growthcast-production-runtime-escrow','object':key}
 data=aws('kms','generate-data-key','--key-id',f['RuntimeKeyArn'],'--key-spec','AES_256','--encryption-context',json.dumps(context));(d/'key').write_bytes(base64.b64decode(data['Plaintext']));(d/'wrapped').write_bytes(base64.b64decode(data['CiphertextBlob']))
 code="const f=require('fs'),c=require('crypto'),key=f.readFileSync('/private/key'),iv=c.randomBytes(12),cipher=c.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('GrowthCast production escrow v1'));const body=Buffer.concat([cipher.update(f.readFileSync('/private/plain')),cipher.final()]);f.writeFileSync('/private/cipher',Buffer.concat([iv,cipher.getAuthTag(),body]));"
 checked(['docker','run','--rm','--network','none','--user','0','--entrypoint','node','-v',str(d)+':/private',load(R/'images.json')['backup'],'-e',code])
 bucket=f['Bucket'];v=aws('s3api','put-object','--bucket',bucket,'--key',key,'--body',str(d/'cipher'),'--if-none-match','*','--server-side-encryption','AES256')['VersionId'];wkey=key+'.kms';wv=aws('s3api','put-object','--bucket',bucket,'--key',wkey,'--body',str(d/'wrapped'),'--if-none-match','*','--server-side-encryption','AES256')['VersionId']
 locator={'bucket':bucket,'key':key,'version':v,'wrappedKey':wkey,'wrappedVersion':wv,'kmsKey':f['RuntimeKeyArn'],'context':context,'sha256':hashlib.sha256((d/'cipher').read_bytes()).hexdigest(),'pins':pins};save(R/'escrow-locator.json',locator)
 for name in ['plain','key','cipher','wrapped']:(d/name).unlink()
 del raw,bundle,data
 access=aws('iam','create-access-key','--user-name',e['Broker'])['AccessKey']
 bootstrap={**os.environ,'AWS_ACCESS_KEY_ID':access['AccessKeyId'],'AWS_SECRET_ACCESS_KEY':access['SecretAccessKey']};bootstrap.pop('AWS_SESSION_TOKEN',None)
 try:
  for attempt in range(12):
   try:role=aws('sts','assume-role','--role-arn',e['RoleArn'],'--role-session-name','production-escrow-acceptance','--duration-seconds','900',env=bootstrap)['Credentials'];break
   except RuntimeError:
    if attempt==11:raise
    time.sleep(2)
 finally:aws('iam','delete-access-key','--user-name',e['Broker'],'--access-key-id',access['AccessKeyId'])
 env={**os.environ,'AWS_ACCESS_KEY_ID':role['AccessKeyId'],'AWS_SECRET_ACCESS_KEY':role['SecretAccessKey'],'AWS_SESSION_TOKEN':role['SessionToken']}
 aws('s3api','get-object','--bucket',bucket,'--key',key,'--version-id',v,str(d/'cipher'),env=env);aws('s3api','get-object','--bucket',bucket,'--key',wkey,'--version-id',wv,str(d/'wrapped'),env=env)
 data=aws('kms','decrypt','--key-id',f['RuntimeKeyArn'],'--ciphertext-blob','fileb://'+str(d/'wrapped'),'--encryption-context',json.dumps(context),env=env);(d/'key').write_bytes(base64.b64decode(data['Plaintext']))
 code="const f=require('fs'),c=require('crypto'),assert=require('assert'),b=f.readFileSync('/private/cipher'),key=f.readFileSync('/private/key');function dec(bytes,k){const d=c.createDecipheriv('aes-256-gcm',k,bytes.subarray(0,12));d.setAAD(Buffer.from('GrowthCast production escrow v1'));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()])};const raw=dec(b,key);assert.equal(c.createHash('sha256').update(raw).digest('hex'),process.argv[1]);const bad=Buffer.from(b);bad[bad.length-1]^=1;assert.throws(()=>dec(bad,key));assert.throws(()=>dec(b,c.randomBytes(32)));console.log('Recovered exact production runtime, database and storage credentials; tampering denied');"
 checked(['docker','run','--rm','--network','none','--user','0','--entrypoint','node','-v',str(d)+':/private:ro',load(R/'images.json')['backup'],'-e',code,expected])
 for role in ['BackupRoleArn','RestoreRoleArn']:
  result=aws('iam','simulate-principal-policy','--policy-source-arn',f[role],'--action-names','s3:GetObject','kms:Decrypt','--resource-arns','arn:aws:s3:::'+bucket+'/'+key,f['RuntimeKeyArn']);assert all(v['EvalDecision']!='allowed' for v in result['EvaluationResults'])
 assert not aws('iam','list-access-keys','--user-name',e['Broker'])['AccessKeyMetadata']
save(R/'escrow-evidence.json',{'checkedAt':now(),'exactProductionVersionsRecovered':3,'originalWorkingCopiesRemovedBeforeRetrieval':True,'independentReaderRole':True,'dataBackupRestoreRolesDenied':True,'tamperingAndWrongKeyDenied':True,'retainedBrokerKeys':0,'temporaryPlaintextRemoved':True})
print('Independent production secret escrow and exact-version recovery passed; temporary access key removed.')
