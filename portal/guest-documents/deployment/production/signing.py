"""Apply the reviewed signing-secret boundary with production-only locators."""
from pathlib import Path
from types import SimpleNamespace
import sys,json
import provider as q
p=q.p;R=q.R;OUT=q.OUT;P=q.P
source=R.parent/'signing-secrets/provision.py'
raw=source.read_text().replace('growthcast-portal-staging-atrium-runtime','growthcast-portal-production-runtime')
raw=q.transform(raw)
module={'__name__':'production_signing','__file__':str(source)};exec(compile(raw,str(source),'exec'),module)
root=OUT/'signing-secrets';root.mkdir(parents=True,exist_ok=True)
def load(path):
 if path==P/'deployment/runtime-connections/pins.json':return {'atrium':p.load(P/'deployment/production/secret-pins.json')['connection']}
 if path==P/'deployment/phase-2-closeout/certificate.json':return p.load(OUT/'provider-pins.json')['Certificate']
 if path==OUT/'signing-service/provider-api-pin.json':return p.load(OUT/'provider-pins.json')['Api']
 if path==OUT/'signing-service/provider-identity.json':return p.load(OUT/'provider-identity.json')
 return p.load(path)
module['R']=root;module['p']=SimpleNamespace(P=P,aws=p.aws,save=p.save,load=load,checked=p.checked,legacy=p)
if __name__=='__main__':module[sys.argv[1]]()
