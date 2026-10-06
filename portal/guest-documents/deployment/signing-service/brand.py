from pathlib import Path
import sys,json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import prepare as p
R=Path(__file__).resolve().parent
pin=p.load(p.P/'deployment/runtime-connections/pins.json')['documenso']
connection=json.loads(p.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
result=p.checked(['docker','run','--rm','-i','--read-only','--user','1001:65533','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,uid=1001,gid=65533,mode=700','-v',str(R/'brand-provider.mjs')+':/brand.mjs:ro','--entrypoint','node',p.load(R/'image.json')['image'],'/brand.mjs'],input=json.dumps({'connection':connection}).encode())
print(result.decode())
p.save(R/'branding.json',{'at':p.legacy.c.now(),'teamId':3,'environment':'staging','recipientBrand':'GrowthCast'})
