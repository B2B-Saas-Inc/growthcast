"""Field-editor-only staging update: schema10, sending disabled, production untouched."""
import sys,json,tempfile,os,uuid,copy
from pathlib import Path
r=Path(__file__).resolve().parent
sys.path.insert(0,str(r))
import prepare as p
out=r/'release/recipient-fields';out.mkdir(parents=True,exist_ok=True);p.OUT=out
if sys.argv[1]=='web':p.web()
elif sys.argv[1]=='image':
 assert not (out/'image.json').exists(),'Published image exists; use the recorded digest'
 before=p.legacy.template(p.legacy.CONFIG['staging']['api']);p.save(out/'before-api.json',before)
 image=p.REPO+':recipient-fields-'+uuid.uuid4().hex[:12]
 with tempfile.TemporaryDirectory() as td:
  context=json.loads(p.checked(['docker','context','inspect']))[0]
  env={**os.environ,'DOCKER_CONFIG':td+'/auth','DOCKER_HOST':context['Endpoints']['docker']['Host']};env.pop('DOCKER_CONTEXT',None)
  p.checked(['docker','login',p.REPO.split('/')[0],'--username','AWS','--password-stdin'],input=p.checked(['aws','ecr','get-login-password','--region','us-east-1']),env=env)
  p.checked(['docker','build','--platform','linux/arm64','-f',str(p.P/'guest-documents/runtime/Dockerfile'),'-t',image,str(p.P)],env=env)
  p.checked(['docker','push',image],env=env)
 digest=p.aws('ecr','describe-images','--repository-name',p.REPO.split('/')[-1],'--image-ids','imageTag='+image.split(':')[-1])['imageDetails'][0]['imageDigest']
 p.save(out/'image.json',{'image':p.REPO+'@'+digest});print('Recipient-field staff runtime published')

elif sys.argv[1]=='api':
 import rollout as m
 m.OUT=out
 before=p.load(out/'before-api.json');current=p.legacy.template(p.legacy.CONFIG['staging']['api']);target=copy.deepcopy(before)
 guest=next(x for x in target['Resources']['Task']['Properties']['ContainerDefinitions'] if x['Name']=='guest');guest['Image']=p.load(out/'image.json')['image']
 assert current in [before,target],'Staging infrastructure changed; reconcile first'
 m.update(p.legacy.CONFIG['staging']['api'],target,{'Task':['Modify'],'Service':['Modify']})
 p.save(out/'api.json',{'image':guest['Image'],'schema':10,'deliveryEnabled':False,'at':p.legacy.c.now()})
 print('Staging recipient-field runtime updated; schema and sending gate unchanged')
elif sys.argv[1]=='alias':
 assert (out/'api.json').exists()
 d=p.load(out/'web.json');assert p.legacy.c.vercel('/v13/deployments/'+d['id'])['readyState']=='READY'
 p.legacy.c.vercel('/v2/deployments/'+d['id']+'/aliases',method='POST',body={'alias':p.legacy.CONFIG['staging']['host']})
 p.save(out/'alias.json',{'deployment':d['id'],'host':p.legacy.CONFIG['staging']['host'],'at':p.legacy.c.now()})
 print('Staging recipient-field frontend aliased')
