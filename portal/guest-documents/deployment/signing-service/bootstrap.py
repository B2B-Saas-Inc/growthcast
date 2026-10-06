"""Idempotent staging provider identity; private inputs use container stdin only."""
from pathlib import Path
import sys,json,secrets
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare as p
R=Path(__file__).resolve().parent
NAME='growthcast/portal/staging/signing/provider-api'

def main():
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 found=p.aws('secretsmanager','list-secrets','--filters','Key=name,Values='+NAME)['SecretList']
 found=[x for x in found if x['Name']==NAME]
 assert len(found)<=1
 if found:
  response=p.aws('secretsmanager','get-secret-value','--secret-id',found[0]['ARN'])
 else:
  value={'purpose':'staging-portal-signing-api','token':'api_'+secrets.token_hex(24)}
  created=p.legacy.request(['secretsmanager','create-secret'],{'Name':NAME,'KmsKeyId':'e397d638-6e4f-4fd8-8e06-9286110348cb','SecretString':json.dumps(value),'Description':'Dedicated internal staging portal Documenso API credential; never browser-exposed.'})
  response=p.aws('secretsmanager','get-secret-value','--secret-id',created['ARN'],'--version-id',created['VersionId'])
 credential=json.loads(response['SecretString']);assert credential['purpose']=='staging-portal-signing-api'
 pin={'arn':response['ARN'],'version':response['VersionId']}
 receipt=R/'provider-api-pin.json'
 if receipt.exists():assert p.load(receipt)==pin
 else:p.save(receipt,pin)
 connection_pin=p.load(p.P/'deployment/runtime-connections/pins.json')['documenso']
 connection=json.loads(p.aws('secretsmanager','get-secret-value','--secret-id',connection_pin['arn'],'--version-id',connection_pin['version'])['SecretString'])
 image=p.load(R/'image.json')['image']
 output=p.checked(['docker','run','--rm','-i','--read-only','--user','1001:65533','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1001,gid=65533,mode=700','-v',str(R/'bootstrap-provider.mjs')+':/bootstrap-provider.mjs:ro','--entrypoint','/usr/local/bin/node',image,'/bootstrap-provider.mjs'],input=json.dumps({'connection':connection,'credential':credential}).encode())
 result=json.loads(output)
 assert set(result)=={'userId','organizationId','teamId','tokenId','reused'}
 assert isinstance(result['teamId'],int) and result['teamId']>0
 p.save(R/'provider-identity.json',{'at':p.legacy.c.now(),**result,'credential':pin,'mailSent':False})
 print('Dedicated staging provider identity verified; no mail sent',flush=True)

if __name__=='__main__':main()
