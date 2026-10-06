"""Run production configuration/secret/transport boundaries in the exact runtime image."""
from pathlib import Path
import sys,tempfile,json,subprocess
import provider as q
p=q.p
files=['runtime/config.check.mjs','runtime/boundary.check.mjs','runtime/signing-secrets.check.mjs','signing/managed-delivery.check.mjs','signing/provider-api.check.mjs']
with tempfile.TemporaryDirectory(prefix='gc-production-package-check-') as td:
 root=Path(td);mounts=[];paths=[]
 for i,rel in enumerate(files):
  raw=(q.P/'guest-documents'/rel).read_text()
  # Keep the intentional wrong-origin case wrong after target conversion.
  if rel=='runtime/config.check.mjs':raw=raw.replace("c.portalOrigin='https://clients.growthcast.app'","c.portalOrigin='https://wrong.example.test'")
  raw=q.transform(raw);f=root/str(i);f.write_text(raw);f.chmod(0o444);dest='/app/guest-documents/'+rel;mounts+=['-v',str(f)+':'+dest+':ro'];paths.append(dest)
 result=subprocess.run(['docker','run','--rm','--network','none','--user','1000:1000','--tmpfs','/run:rw,uid=1000,gid=1000,mode=700','--entrypoint','node',*mounts,p.load(q.OUT/'images.json')['guest'],'--test',*paths],capture_output=True,text=True)
 print(result.stdout);print(result.stderr);assert result.returncode==0
 result=result.stdout
 p.save(q.OUT/'package-checks.json',{'at':p.c.now(),'passed':True,'files':files,'image':p.load(q.OUT/'images.json')['guest'],'network':'none'})
