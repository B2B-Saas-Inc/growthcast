from common import *
import secrets
mode=__import__('sys').argv[1];assert mode in ['seed','cleanup']
if mode=='seed':
 assert not (PRIVATE/'fixture.json').exists()
 pin=load(R/'secret-pins.json')['connection'];(PRIVATE/'connection.json').write_text(aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
 save(PRIVATE/'fixture.json',{'prefix':'planning-'+secrets.token_hex(8),'password':secrets.token_hex(32)})
 save(R/'fixture-evidence.json',{'prefix':load(PRIVATE/'fixture.json')['prefix'],'synthetic':True})
image=load(R/'images.json')['api']
r=checked(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(PRIVATE)+':/private:ro','-v',str(R/'fixture.mjs')+':/fixture.mjs:ro',image,'/fixture.mjs',mode])
if mode=='cleanup':save(R/'fixture-cleanup.json',json.loads(r));(PRIVATE/'fixture.json').unlink();(PRIVATE/'connection.json').unlink()
print(r.decode().strip())
