from pathlib import Path
import sys
import prepare as p
p.OUT=Path(__file__).resolve().parent/'recipient-rollout/release/staging'
p.OUT.mkdir(parents=True,exist_ok=True)
if sys.argv[1]=='prepare':p.web()
elif sys.argv[1]=='alias':
 d=p.load(p.OUT/'web.json');assert p.legacy.c.vercel('/v13/deployments/'+d['id'])['readyState']=='READY'
 p.legacy.c.vercel('/v2/deployments/'+d['id']+'/aliases',method='POST',body={'alias':p.legacy.CONFIG['staging']['host']})
 p.save(p.OUT/'alias.json',{'deployment':d['id'],'host':p.legacy.CONFIG['staging']['host'],'at':p.legacy.c.now()})
 print('Staging frontend updated')
