"""Commission the existing staging staff container's delivery worker."""
from pathlib import Path
import sys,copy
import prepare as p
import rollout
R=Path(__file__).resolve().parent/'delivery-rollout';OUT=R/'release/staging'
p.R=R;p.OUT=OUT;p.legacy.R=R;rollout.R=R;rollout.OUT=OUT

def inventory():
 assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
 OUT.mkdir(parents=True,exist_ok=True)
 for kind in ['api','recovery']:
  stack,outputs=p.legacy.info(p.legacy.CONFIG['staging'][kind]);path=OUT/('before-'+kind+'.json')
  if not path.exists():p.save(path,{'template':p.legacy.template(p.legacy.CONFIG['staging'][kind]),'outputs':outputs,'parameters':stack.get('Parameters',[])})
 print('Staging delivery baseline recorded')
def deploy():
 assert (OUT/'baseline-verified.json').exists()
 target=copy.deepcopy(p.load(OUT/'before-api.json')['template']);task=target['Resources']['Task']['Properties']
 task['Volumes'].append({'Name':'signing'})
 guest=next(c for c in task['ContainerDefinitions'] if c['Name']=='guest')
 guest['EntryPoint']=['node'];guest['Command']=['/app/guest-documents/runtime/signing-start.mjs'];guest['StopTimeout']=120
 guest['Environment'].append({'Name':'GC_SIGNING_SERVICE','Value':'delivery'})
 guest['MountPoints'] += [{'SourceVolume':'signing','ContainerPath':'/run/signing','ReadOnly':False},{'SourceVolume':'delivered','ContainerPath':'/run/delivered','ReadOnly':True}]
 rollout.update(p.legacy.CONFIG['staging']['api'],target,{'Task':['Modify'],'Service':['Modify']})
 _,outputs=p.legacy.info(p.legacy.CONFIG['staging']['api']);p.save(OUT/'api.json',{'outputs':outputs,'template':target,'sendingEnabled':True})
 print('Staging delivery worker enabled')
if __name__=='__main__':{'inventory':inventory,'baseline':lambda:p.legacy.baseline('staging'),'poll':lambda:p.legacy.poll('staging'),'deploy':deploy}[sys.argv[1]]()
