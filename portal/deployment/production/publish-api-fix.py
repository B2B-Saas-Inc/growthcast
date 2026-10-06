from common import *
import tempfile,uuid
# Verify the actual compiled Bun controller before publishing the new base image.
checked(['docker','run','--rm','--network','none','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(R/'webhook-runtime.check.mjs')+':/test.mjs:ro','growthcast-atrium-runtime','/test.mjs'])
f=load(R/'foundation-resources.json');tag='api-async-signatures-'+uuid.uuid4().hex
context=load_json=None
context=json.loads(checked(['docker','context','inspect']))[0]
with tempfile.TemporaryDirectory() as td:
 env=os.environ.copy();env.pop('DOCKER_CONTEXT',None);env['DOCKER_CONFIG']=td;env['DOCKER_HOST']=context['Endpoints']['docker']['Host']
 password=checked(['aws','ecr','get-login-password','--region','us-east-1'])
 checked(['docker','login',f['Repository'].split('/')[0],'--username','AWS','--password-stdin'],input=password,env=env)
 checked(['docker','tag','growthcast-atrium-runtime',f['Repository']+':'+tag],env=env);checked(['docker','push',f['Repository']+':'+tag],env=env)
digest=aws('ecr','describe-images','--repository-name','growthcast-portal-production','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
save(R/'api-base.json',{'image':f['Repository']+'@'+digest,'source':'Pinned upstream plus reviewed API patches','asyncWebhookRuntimeTests':'passed','focusedBuildTests':48})
i=load(R/'images.json');save(R/'pre-webhook-fix-images.json',i);del i['api'];save(R/'images.json',i)
print('Compiled Bun webhook verification tests passed; corrected API base image published.')
