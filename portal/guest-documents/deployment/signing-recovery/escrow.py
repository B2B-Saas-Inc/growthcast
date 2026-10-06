"""Extend the existing staging escrow with exact signing integration versions."""
from pathlib import Path
import sys,json,os,tempfile,uuid,base64,hashlib,time,subprocess
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare as p
R=Path(__file__).resolve().parent;os.umask(0o077)
C=p.P/'deployment/phase-2-closeout';RES=p.load(C/'resources.json')
B='growthcast-portal-staging-recovery-059393269249'
def local(directory,mode):
 output=p.checked(['docker','run','--rm','--network','none','--user','0','--entrypoint','node','-v',str(directory)+':/private','-v',str(R/'archive.mjs')+':/archive.mjs:ro','growthcast-guest-runtime','/archive.mjs',mode])
 return json.loads(output)
def capture():
 pins=p.load(R.parent/'signing-secrets/pins.json');pins['provider']=p.load(R.parent/'signing-service/provider-api-pin.json')
 refs={name:{k:pin[k] for k in ['arn','version']} for name,pin in pins.items()}
 if (R/'locator.json').exists():assert p.load(R/'locator.json')['pins']==refs;return
 key='runtime-escrow/staging/signing-'+uuid.uuid4().hex+'/archive.bin';context={'purpose':'growthcast-staging-runtime-escrow','object':key}
 with tempfile.TemporaryDirectory(prefix='growthcast-signing-escrow-') as td:
  root=Path(td);entries={}
  for name,pin in refs.items():
   result=p.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version']);assert result['VersionId']==pin['version'];entries[name]={**pin,'value':result['SecretString']}
  previous=p.load(C/'escrow-locator.json')
  p.aws('s3api','head-object','--bucket',previous['bucket'],'--key',previous['key'],'--version-id',previous['version'])
  (root/'bundle.json').write_text(json.dumps({'schemaVersion':1,'environment':'staging','entries':entries,'previousRuntimeEscrow':previous}));del entries,result
  data=p.legacy.request(['kms','generate-data-key'],{'KeyId':RES['EscrowKeyArn'],'KeySpec':'AES_256','EncryptionContext':context})
  (root/'data-key').write_text(data['Plaintext']);(root/'wrapped.bin').write_bytes(base64.b64decode(data['CiphertextBlob']));del data
  proof=local(root,'encrypt');wrapped=key.replace('archive.bin','wrapped-key.bin')
  version=p.aws('s3api','put-object','--bucket',B,'--key',key,'--body',str(root/'archive.bin'),'--if-none-match','*')['VersionId']
  wrapped_version=p.aws('s3api','put-object','--bucket',B,'--key',wrapped,'--body',str(root/'wrapped.bin'),'--if-none-match','*')['VersionId']
  p.save(R/'locator.json',{'bucket':B,'key':key,'version':version,'wrappedKey':wrapped,'wrappedVersion':wrapped_version,'kmsKey':RES['EscrowKeyArn'],'context':context,'sha256':proof['archiveDigest'],'plaintextDigest':proof['plaintextDigest'],'pins':refs})
 print('Signing escrow captured; temporary source copies removed',flush=True)
def recover():
 locator=p.load(R/'locator.json')
 if (R/'verification.json').exists():print('Existing signing recovery verification retained',flush=True);return
 broker='growthcast-portal-staging-secret-recovery-broker'
 assert not p.aws('iam','list-access-keys','--user-name',broker)['AccessKeyMetadata']
 access=p.aws('iam','create-access-key','--user-name',broker)['AccessKey']
 try:
  bootstrap={k:v for k,v in os.environ.items() if k not in ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE']};bootstrap.update(AWS_ACCESS_KEY_ID=access['AccessKeyId'],AWS_SECRET_ACCESS_KEY=access['SecretAccessKey'])
  for attempt in range(12):
   try:role=p.aws('sts','assume-role','--role-arn',RES['EscrowReaderArn'],'--role-session-name','signing-secret-recovery','--duration-seconds','900',env=bootstrap)['Credentials'];break
   except RuntimeError:
    if attempt==11:raise
    time.sleep(2)
 finally:p.aws('iam','delete-access-key','--user-name',broker,'--access-key-id',access['AccessKeyId'])
 env={**os.environ,'AWS_ACCESS_KEY_ID':role['AccessKeyId'],'AWS_SECRET_ACCESS_KEY':role['SecretAccessKey'],'AWS_SESSION_TOKEN':role['SessionToken']};del access,role,bootstrap
 with tempfile.TemporaryDirectory(prefix='growthcast-signing-recovered-') as td:
  root=Path(td)
  for key,version,file in [('key','version','archive.bin'),('wrappedKey','wrappedVersion','wrapped.bin')]:p.aws('s3api','get-object','--bucket',B,'--key',locator[key],'--version-id',locator[version],str(root/file),env=env)
  assert hashlib.sha256((root/'archive.bin').read_bytes()).hexdigest()==locator['sha256']
  recovered=p.aws('kms','decrypt','--key-id',locator['kmsKey'],'--ciphertext-blob','fileb://'+str(root/'wrapped.bin'),'--encryption-context',json.dumps(locator['context']),env=env)
  (root/'data-key').write_text(recovered['Plaintext']);del recovered
  (root/'expected-digest').write_text(locator['plaintextDigest']);report=local(root,'recover')
  denied=0
  checks=[['secretsmanager','get-secret-value','--secret-id',pin['arn']] for name,pin in locator['pins'].items()]
  checks += [['s3api','put-object','--bucket',B,'--key',locator['key'],'--body',str(root/'archive.bin')],['kms','decrypt','--key-id',locator['kmsKey'],'--ciphertext-blob','fileb://'+str(root/'wrapped.bin'),'--encryption-context',json.dumps({**locator['context'],'purpose':'wrong'})]]
  for args in checks:
   response=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,env=env);assert response.returncode!=0 and b'AccessDenied' in response.stderr;denied+=1
 del env
 assert not p.aws('iam','list-access-keys','--user-name',broker)['AccessKeyMetadata']
 for role_name in ['growthcast-portal-staging-backup-task','growthcast-portal-staging-restore-task']:
  result=p.aws('iam','simulate-principal-policy','--policy-source-arn','arn:aws:iam::059393269249:role/'+role_name,'--action-names','s3:GetObject','--resource-arns','arn:aws:s3:::'+B+'/'+locator['key']);assert all(x['EvalDecision']!='allowed' for x in result['EvaluationResults'])
 report.update(at=p.legacy.c.now(),liveDenials=denied,exactS3Versions=True,separateRecoveryRole=True,sourceCopiesRemovedBeforeRecovery=True,temporaryPlaintextRemoved=True,brokerAccessKeysRemoved=True,dataBackupRolesDenied=True)
 p.save(R/'verification.json',report);print('Signing integration secrets recovered; source-read, overwrite and wrong-context denials passed',flush=True)
if __name__=='__main__':
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 capture();recover()
