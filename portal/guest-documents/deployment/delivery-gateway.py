"""Repair staging gateway asset-burst handling using the existing service."""
from pathlib import Path
import sys,json,tempfile,os,uuid
import prepare as p
R=Path(__file__).resolve().parent;OUT=R/'recipient-rollout/release/staging';STACK='growthcast-portal-staging-signing-services'
def image():
 OUT.mkdir(parents=True,exist_ok=True)
 if (OUT/'gateway-image.json').exists():return
 with tempfile.TemporaryDirectory(prefix='growthcast-gateway-image-') as td:
  context=json.loads(p.checked(['docker','context','inspect']))[0];env={**os.environ,'DOCKER_CONFIG':td+'/auth','DOCKER_HOST':context['Endpoints']['docker']['Host']};env.pop('DOCKER_CONTEXT',None)
  p.checked(['docker','login',p.REPO.split('/')[0],'--username','AWS','--password-stdin'],input=p.checked(['aws','ecr','get-login-password','--region','us-east-1']),env=env)
  tag='gateway-assets-'+uuid.uuid4().hex[:12];image=p.REPO+':'+tag
  p.checked(['docker','build','--platform','linux/arm64','-f',str(p.P/'guest-documents/runtime/Dockerfile'),'-t',image,str(p.P)],env=env);p.checked(['docker','push',image],env=env)
  digest=p.aws('ecr','describe-images','--repository-name',p.REPO.split('/')[-1],'--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest'];p.save(OUT/'gateway-image.json',{'image':p.REPO+'@'+digest})
 print('Corrected gateway image published')
def deploy():
 t=p.legacy.template(STACK);p.save(OUT/'gateway-before.json',t)
 t['Resources']['GatewayTask']['Properties']['ContainerDefinitions'][0]['Image']=p.load(OUT/'gateway-image.json')['image']
 p.save(OUT/'gateway-template.json',t)
 p.legacy.request(['cloudformation','update-stack'],{'StackName':STACK,'TemplateBody':json.dumps(t),'Parameters':[{'ParameterKey':'DesiredCount','UsePreviousValue':True}]})
 print('Gateway asset-burst repair deployment started')
def api():
 import rollout
 rollout.OUT=OUT
 t=p.legacy.template(p.legacy.CONFIG['staging']['api'])
 guest=next(c for c in t['Resources']['Task']['Properties']['ContainerDefinitions'] if c['Name']=='guest')
 guest['Image']=p.load(OUT/'gateway-image.json')['image']
 rollout.update(p.legacy.CONFIG['staging']['api'],t,{'Task':['Modify'],'Service':['Modify']})
 p.save(OUT/'api.json',{'at':p.legacy.c.now(),'image':guest['Image']})

def route():
 t=p.legacy.template(STACK)
 for resource in t['Resources'].values():
  if resource['Type']=='AWS::ElasticLoadBalancingV2::ListenerRule' and resource['Properties']['Priority']==3:
   for c in resource['Properties']['Conditions']:
    if c['Field']=='path-pattern':
     values=c.get('Values',c.get('PathPatternConfig',{}).get('Values'));assert values is not None
     if '/api/branding/logo/team/3' not in values:values.append('/api/branding/logo/team/3')
 p.legacy.request(['cloudformation','update-stack'],{'StackName':STACK,'TemplateBody':json.dumps(t),'Parameters':[{'ParameterKey':'DesiredCount','UsePreviousValue':True}]})
 print('Brand logo route update started')

def status():
 s=p.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0];assert 'ROLLBACK' not in s['StackStatus'] and 'FAILED' not in s['StackStatus']
 if s['StackStatus']!='UPDATE_COMPLETE':print('Gateway deployment pending');return
 if p.legacy.template(STACK)['Resources']['GatewayTask']['Properties']['ContainerDefinitions'][0]['Image']!=p.load(OUT/'gateway-image.json')['image']:print('Gateway image not yet deployed');return
 p.save(OUT/'gateway.json',{'at':p.legacy.c.now(),'image':p.load(OUT/'gateway-image.json')['image'],'status':s['StackStatus']});print('Gateway repair deployed')
if __name__=='__main__':{'image':image,'deploy':deploy,'status':status,'api':api,'route':route}[sys.argv[1]]()
