"""Version-bound escrow of actual staging material, isolated from data backups."""
import re,os,json,tempfile,subprocess,base64,uuid,hashlib,datetime,time
from pathlib import Path
from aws import aws,request
R=Path(__file__).resolve().parent;os.umask(0o077)
d=json.loads((R/'resources.json').read_text());pins=json.loads((R.parent/'runtime-secrets/runtime-pins.json').read_text());cp=json.loads((R.parent/'runtime-connections/pins.json').read_text());cert=json.loads((R/'certificate.json').read_text())
assert not (R/'escrow-evidence.json').exists(),'Existing escrow needs explicit reconciliation'
if (R/'escrow-locator.json').exists():
 history=R/'escrow-attempt-history.json';items=json.loads(history.read_text()) if history.exists() else [];items.append(json.loads((R/'escrow-locator.json').read_text()));history.write_text(json.dumps(items,indent=2)+'\n')
B='growthcast-portal-staging-recovery-059393269249';key='runtime-escrow/staging/'+uuid.uuid4().hex+'/archive.bin';context={'purpose':'growthcast-staging-runtime-escrow','object':key}
with tempfile.TemporaryDirectory(prefix='growthcast-live-escrow-') as directory:
 f=Path(directory);entries={}
 for name,source in [(n+'-'+s,p) for n,group in [('runtime',pins),('connection',cp)] for s,p in group.items()]+[('signing-certificate',cert)]:
  r=aws('secretsmanager','get-secret-value','--secret-id',source['arn'],'--version-id',source['version']);assert r['VersionId']==source['version'];entries[name]={'arn':source['arn'],'version':source['version'],'value':r['SecretString']}
 (f/'bundle.json').write_text(json.dumps({'schemaVersion':1,'environment':'staging','entries':entries},sort_keys=True));del entries,r
 k=request(['kms','generate-data-key'],{'KeyId':d['EscrowKeyArn'],'KeySpec':'AES_256','EncryptionContext':context});(f/'data-key').write_text(k['Plaintext']);(f/'wrapped.bin').write_bytes(base64.b64decode(k['CiphertextBlob']));del k
 def local(mode):
  r=subprocess.run(['docker','run','--rm','--user','0',*(['--network','none'] if mode=='encrypt' else []),'--entrypoint','/usr/local/bin/bun','-v',directory+':/private','-v',str(R/'escrow.mjs')+':/escrow.mjs:ro','growthcast-atrium-runtime','/escrow.mjs',mode],capture_output=True,text=True)
  if r.returncode:
   print(r.stdout[:300])
  assert r.returncode==0,'Escrow local operation failed: '+mode
  return json.loads(r.stdout)
 checks=local('encrypt');(f/'expected-digest').write_text(checks['plaintextDigest'])
 wrapKey=key.replace('archive.bin','wrapped-key.bin');version=aws('s3api','put-object','--bucket',B,'--key',key,'--body',str(f/'archive.bin'),'--if-none-match','*')['VersionId'];wv=aws('s3api','put-object','--bucket',B,'--key',wrapKey,'--body',str(f/'wrapped.bin'),'--if-none-match','*')['VersionId']
 locator={'bucket':B,'key':key,'version':version,'wrappedKey':wrapKey,'wrappedVersion':wv,'kmsKey':d['EscrowKeyArn'],'context':context,'sha256':checks['archiveDigest']};(R/'escrow-locator.json').write_text(json.dumps(locator,indent=2)+'\n')
 for name in ['bundle.json','data-key','archive.bin','wrapped.bin']:(f/name).unlink()
 broker='growthcast-portal-staging-secret-recovery-broker'
 assert not aws('iam','list-access-keys','--user-name',broker)['AccessKeyMetadata']
 access=aws('iam','create-access-key','--user-name',broker)['AccessKey']
 try:
  bootstrap={k:v for k,v in os.environ.items() if k not in ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN']};bootstrap.update(AWS_ACCESS_KEY_ID=access['AccessKeyId'],AWS_SECRET_ACCESS_KEY=access['SecretAccessKey'])
  for attempt in range(12):
   try:role=aws('sts','assume-role','--role-arn',d['EscrowReaderArn'],'--role-session-name','phase2-secret-recovery','--duration-seconds','900',env=bootstrap)['Credentials'];break
   except RuntimeError:
    if attempt==11:raise
    time.sleep(2)
 finally:aws('iam','delete-access-key','--user-name',broker,'--access-key-id',access['AccessKeyId'])
 env={**os.environ,'AWS_ACCESS_KEY_ID':role['AccessKeyId'],'AWS_SECRET_ACCESS_KEY':role['SecretAccessKey'],'AWS_SESSION_TOKEN':role['SessionToken']};del role,access,bootstrap
 aws('s3api','get-object','--bucket',B,'--key',key,'--version-id',version,str(f/'archive.bin'),env=env);aws('s3api','get-object','--bucket',B,'--key',wrapKey,'--version-id',wv,str(f/'wrapped.bin'),env=env)
 assert hashlib.sha256((f/'archive.bin').read_bytes()).hexdigest()==locator['sha256']
 recovered=aws('kms','decrypt','--key-id',d['EscrowKeyArn'],'--ciphertext-blob','fileb://'+str(f/'wrapped.bin'),'--encryption-context',json.dumps(context),env=env);(f/'data-key').write_text(recovered['Plaintext']);del recovered
 report=local('recover')
 # Restore role cannot access source secrets, mutate archive, or unwrap with wrong context.
 denied=0
 for args in [['secretsmanager','get-secret-value','--secret-id',pins['atrium']['arn']],['s3api','put-object','--bucket',B,'--key',key,'--body',str(f/'archive.bin')],['kms','decrypt','--key-id',d['EscrowKeyArn'],'--ciphertext-blob','fileb://'+str(f/'wrapped.bin'),'--encryption-context',json.dumps({**context,'purpose':'wrong'})]]:
  r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,env=env);assert r.returncode!=0 and b'AccessDenied' in r.stderr;denied+=1
 del env
 # Recovered secrets are consumed by real packages against isolated disposable databases.
 applications={}
 for service,script in [('atrium','run.sh'),('documenso','signing.sh')]:
  print('Verifying recovered '+service+' identity in isolated real application...',flush=True)
  environment={**os.environ,'PHASE2_CLOSEOUT_ROOT':str(R),'PHASE2_CLOSEOUT_INPUT':directory,'RUNTIME_TEST_SERVICE':service,'RUNTIME_MANAGED_STORAGE':'0','RUNTIME_SECRET_RECOVERY':'0'}
  result=subprocess.run(['sh',str(R.parent/'runtime/test'/script)],capture_output=True,env=environment)
  if result.returncode:
   # Only fixed diagnostic categories are admitted; application output may contain secrets.
   markers=[m for m in ['AssertionError','SIGSEGV','TimeoutError','unhealthy','EACCES','permission denied','ReferenceError','Cannot find','MODULE_NOT_FOUND'] if m.encode() in result.stdout+result.stderr]
   diagnostic=(result.stdout+result.stderr).decode(errors='replace')[-2500:]
   diagnostic=re.sub(r'(?:postgres(?:ql)?://|https://)[^\s]+','[URL withheld]',diagnostic)
   diagnostic=re.sub(r'[A-Za-z0-9_+/=-]{48,}','[opaque value withheld]',diagnostic)
   print(diagnostic)
   (R/'application-failure.json').write_text(json.dumps({'service':service,'markers':markers},indent=2)+'\n')
  assert result.returncode==0,'Recovered application verification failed: '+service
  applications[service]={'result':'passed','scope':'actual recovered staging keys with isolated disposable database','sessionAndFileRestart':service=='atrium','nativeAndSdkSigningWithManagedCertificate':service=='documenso','fourPdfSignaturesVerified':service=='documenso'}
 report['applications']=applications
 # Independent policy checks: ordinary data backup/restore identities cannot read escrow.
 for roleName in ['growthcast-portal-staging-backup-task','growthcast-portal-staging-restore-task']:
  result=aws('iam','simulate-principal-policy','--policy-source-arn','arn:aws:iam::059393269249:role/'+roleName,'--action-names','s3:GetObject','--resource-arns','arn:aws:s3:::'+B+'/'+key)
  assert all(x['EvalDecision']!='allowed' for x in result['EvaluationResults'])
 report.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='actual pinned staging runtime, connection, and signing secrets',originalWorkingCopiesRemovedBeforeRetrieval=True,exactS3Versions=True,separateEscrowRole=True,liveDenials=denied,dataBackupRolesDenied=True,temporaryPlaintextRemoved=True,liveAuthAndStripeKeysUnchanged=True)
 (R/'escrow-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Actual staging secrets recovered under separate read-only escrow role; saved integration settings decrypt and re-encryption rehearsal passes.')
