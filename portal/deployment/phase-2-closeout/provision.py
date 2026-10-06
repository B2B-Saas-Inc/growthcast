import json,os,secrets,subprocess,tempfile,base64,datetime
from pathlib import Path
from aws import aws,request,create_stack
R=Path(__file__).resolve().parent;os.umask(0o077)
p=R/'resources.json'
if p.exists():d=json.loads(p.read_text())
else:d=create_stack('growthcast-portal-staging-secret-escrow',json.loads((R/'foundation.json').read_text()));p.write_text(json.dumps(d,indent=2)+'\n')
assert not (R/'certificate.json').exists(),'Existing certificate must not be overwritten'
assert not aws('secretsmanager','describe-secret','--secret-id',d['SigningSecretArn']).get('VersionIdsToStages'),'Certificate already initialized: reconcile receipt'
with tempfile.TemporaryDirectory(prefix='growthcast-signing-') as directory:
 f=Path(directory);(f/'passphrase').write_text(secrets.token_hex(32))
 script='''set -eu
openssl req -x509 -newkey rsa:3072 -nodes -days 365 -subj '/O=GrowthCast Staging/CN=GrowthCast TEST Document Signing' -addext 'keyUsage=critical,digitalSignature,nonRepudiation' -keyout /work/signing.key -out /work/signing.crt 2>/dev/null
openssl pkcs12 -export -out /work/signing.p12 -inkey /work/signing.key -in /work/signing.crt -passout file:/work/passphrase
openssl x509 -in /work/signing.crt -noout -fingerprint -sha256 -enddate
'''
 r=subprocess.run(['docker','run','--rm','--network','none','--user','0','--entrypoint','sh','-v',directory+':/work','growthcast-documenso-runtime','-c',script],capture_output=True,text=True);assert r.returncode==0,'Certificate creation failed'
 value={'schemaVersion':1,'purpose':'staging-document-signing-only','p12':base64.b64encode((f/'signing.p12').read_bytes()).decode(),'passphrase':(f/'passphrase').read_text()}
 written=request(['secretsmanager','put-secret-value'],{'SecretId':d['SigningSecretArn'],'SecretString':json.dumps(value)})
 assert json.loads(aws('secretsmanager','get-secret-value','--secret-id',d['SigningSecretArn'],'--version-id',written['VersionId'])['SecretString'])==value
 (R/'certificate.json').write_text(json.dumps({'arn':d['SigningSecretArn'],'version':written['VersionId'],'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'staging-only-self-signed','identity':r.stdout.strip().splitlines(),'separateFromTls':True,'privateFilesRemoved':True},indent=2)+'\n')
print('Dedicated staging signing certificate stored and verified; plaintext temporary files removed.')
