"""Resume exact-version production escrow verification after a failed local verifier."""
from pathlib import Path
import os,json,tempfile,base64,hashlib,time,subprocess
import provider as q
p=q.p;root=q.OUT/'signing-escrow';loc=p.load(root/'escrow-locator.json');resources=p.load(root/'escrow-resources.json')
# Build the comparison digest without retaining any plaintext working copy.
values={k:p.aws('secretsmanager','get-secret-value','--secret-id',v['arn'],'--version-id',v['version'])['SecretString'] for k,v in loc['pins'].items()}
expected=hashlib.sha256(json.dumps(values).encode()).hexdigest();del values
assert not p.aws('iam','list-access-keys','--user-name',resources['Broker'])['AccessKeyMetadata']
access=p.aws('iam','create-access-key','--user-name',resources['Broker'])['AccessKey']
try:
 bootstrap={k:v for k,v in os.environ.items() if k not in ['AWS_PROFILE','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN']};bootstrap.update(AWS_ACCESS_KEY_ID=access['AccessKeyId'],AWS_SECRET_ACCESS_KEY=access['SecretAccessKey'])
 for attempt in range(12):
  try:role=p.aws('sts','assume-role','--role-arn',resources['RoleArn'],'--role-session-name','production-signing-recovery','--duration-seconds','900',env=bootstrap)['Credentials'];break
  except RuntimeError:
   if attempt==11:raise
   time.sleep(2)
finally:p.aws('iam','delete-access-key','--user-name',resources['Broker'],'--access-key-id',access['AccessKeyId'])
env={**bootstrap,'AWS_ACCESS_KEY_ID':role['AccessKeyId'],'AWS_SECRET_ACCESS_KEY':role['SecretAccessKey'],'AWS_SESSION_TOKEN':role['SessionToken']};del role,access,bootstrap
with tempfile.TemporaryDirectory(prefix='gc-signing-recovery-') as td:
 d=Path(td)
 for key,version,name in [('key','version','cipher'),('wrappedKey','wrappedVersion','wrapped')]:p.aws('s3api','get-object','--bucket',loc['bucket'],'--key',loc[key],'--version-id',loc[version],str(d/name),env=env)
 assert hashlib.sha256((d/'cipher').read_bytes()).hexdigest()==loc['sha256']
 data=p.aws('kms','decrypt','--key-id',loc['kmsKey'],'--ciphertext-blob','fileb://'+str(d/'wrapped'),'--encryption-context',json.dumps(loc['context']),env=env);(d/'key').write_bytes(base64.b64decode(data['Plaintext']));del data
 code="const f=require('fs'),c=require('crypto'),assert=require('assert'),b=f.readFileSync('/private/cipher'),key=f.readFileSync('/private/key');function dec(bytes,k){const d=c.createDecipheriv('aes-256-gcm',k,bytes.subarray(0,12));d.setAAD(Buffer.from('GrowthCast production escrow v1'));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()])};const raw=dec(b,key);assert.equal(c.createHash('sha256').update(raw).digest('hex'),process.argv[1]);const bad=Buffer.from(b);bad[bad.length-1]^=1;assert.throws(()=>dec(bad,key));assert.throws(()=>dec(b,c.randomBytes(32)));console.log('Exact production signing escrow verified; tamper and wrong-key checks pass');"
 result=subprocess.run(['docker','run','--rm','--network','none','--user','0','--entrypoint','node','-v',td+':/private:ro',p.load(root/'images.json')['backup'],'-e',code,expected],capture_output=True,text=True)
 print(result.stdout);print(result.stderr);assert result.returncode==0
 denied=0
 for pin in loc['pins'].values():
  result=subprocess.run(['aws','secretsmanager','get-secret-value','--secret-id',pin['arn'],'--region','us-east-1'],capture_output=True,env=env);assert result.returncode and b'AccessDenied' in result.stderr;denied+=1
 for role_name in ['growthcast-portal-production-backup','growthcast-portal-production-restore']:
  result=p.aws('iam','simulate-principal-policy','--policy-source-arn','arn:aws:iam::059393269249:role/'+role_name,'--action-names','s3:GetObject','--resource-arns','arn:aws:s3:::'+loc['bucket']+'/'+loc['key']);assert all(x['EvalDecision']!='allowed' for x in result['EvaluationResults'])
assert not p.aws('iam','list-access-keys','--user-name',resources['Broker'])['AccessKeyMetadata']
p.save(root/'escrow-evidence.json',{'at':p.c.now(),'exactProductionVersionsRecovered':len(loc['pins']),'independentReaderRole':True,'sourceSecretReadsDenied':denied,'dataRolesDenied':True,'tamperingAndWrongKeyDenied':True,'temporaryPlaintextRemoved':True,'retainedBrokerKeys':0})
