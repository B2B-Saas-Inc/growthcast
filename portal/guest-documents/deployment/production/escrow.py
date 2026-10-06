"""Extend independent production secret recovery with the new signing identities."""
import sys,json,shutil
from pathlib import Path
import provider as q
p=q.p;root=q.OUT/'signing-escrow';root.mkdir(parents=True,exist_ok=True)
pins=p.load(q.P/'deployment/production/secret-pins.json')
pins.update({'provider'+k:v for k,v in p.load(q.OUT/'provider-pins.json').items()})
pins.update({'signing'+k:{a:v[a] for a in ['arn','version']} for k,v in p.load(q.OUT/'signing-secrets/pins.json').items()})
if (root/'escrow-evidence.json').exists():
 assert p.load(root/'secret-pins.json')==pins;print('Recorded production signing escrow retained');raise SystemExit()
p.save(root/'secret-pins.json',pins)
for name in ['foundation-resources.json','escrow-resources.json','images.json']:shutil.copy2(q.P/'deployment/production'/name,root/name)
source=(q.P/'deployment/production/escrow.py').read_text().replace('from common import *','from common import *\nR=Path('+repr(str(root))+')')
source=source.replace("'exactProductionVersionsRecovered':3","'exactProductionVersionsRecovered':len(pins)")
exec(compile(source,str(q.P/'deployment/production/escrow.py'),'exec'),{'__name__':'production_signing_escrow'})
