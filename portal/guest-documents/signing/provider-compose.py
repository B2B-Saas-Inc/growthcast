"""Reuse the pinned disposable Documenso fixture beside the managed Atrium harness."""
from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parents[2]
source=json.loads(subprocess.check_output(['docker','compose','--profile','test','-f',str(root/'gateway/compose.yaml'),'config','--format','json']))
names={name:'signing-'+name for name in ['database','prepare','migrate','documenso','seed']}
names['mail']='delivery-mail'
services={}
for name in ['database','prepare','migrate','documenso','seed']:
 service=source['services'][name]
 service.pop('profiles',None)
 service['networks']=['private']
 if 'depends_on' in service:service['depends_on']={names[k]:v for k,v in service['depends_on'].items()}
 for key,value in service.get('environment',{}).items():
  if isinstance(value,str):service['environment'][key]=value.replace('@database:', '@signing-database:').replace('http://documenso:', 'http://signing-documenso:')
 if name=='documenso':service['environment']['NEXT_PRIVATE_SMTP_HOST']='delivery-mail'
 for volume in service.get('volumes',[]):
  if volume['type']=='volume':volume['source']='signing-'+volume['source']
 services[names[name]]=service
services['delivery-check']={'user':'root','volumes':['signing-runtime:/provider-runtime'],'environment':{'REAL_SIGNING':'1'}}
services['delivery-gateway']={'image':'growthcast-guest-delivery','command':['node','/foundation/guest/signing/gateway-fixture.mjs'],
 'volumes':['gateway-credentials:/credential:ro','ca:/ca:ro','signing-runtime:/provider-runtime:ro',str(root/'guest-documents')+':/foundation/guest:ro'],
 'networks':{'private':{},'signing-edge':{'aliases':['signing.growthcast.test']}}}
services['delivery-browser']={'build':{'context':str(root/'gateway'),'dockerfile':'Dockerfile.browser'},'command':['node','/gateway/delivery-browser.mjs'],
 'volumes':['signing-runtime:/provider-runtime:ro',str(root/'guest-documents/signing/delivery-browser.mjs')+':/gateway/delivery-browser.mjs:ro'],
 'networks':['signing-edge']}
services['signing-seed']['volumes'].append({'type':'bind','source':str(root/'guest-documents/signing/verify-delivery.cjs'),'target':'/delivery-verify.cjs','read_only':True})
Path(sys.argv[1]).write_text(json.dumps({'networks':{'signing-edge':{'internal':True}},'services':services,'volumes':{'signing-database':{},'signing-runtime':{}}}))
