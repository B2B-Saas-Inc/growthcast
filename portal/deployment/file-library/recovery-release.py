"""Bounded recovery-image updates; retain identities, schedules, alarms and network."""
import json,sys,time,uuid,tempfile,os
from pathlib import Path
from release import *

def update(env,stack,parameters,allowed,new_template=None,label=None):
 out=R/'release'/env;label=label or stack
 current,outputs=info(stack)
 if new_template is None and all(next(p['ParameterValue'] for p in current['Parameters'] if p['ParameterKey']==k)==v for k,v in parameters.items()):return outputs
 if new_template is not None and new_template==template(stack):return outputs
 change='library-'+uuid.uuid4().hex[:12]
 data={'StackName':stack,'ChangeSetName':change,'ChangeSetType':'UPDATE','Capabilities':['CAPABILITY_NAMED_IAM'],'Parameters':[{'ParameterKey':p['ParameterKey'],**({'ParameterValue':parameters[p['ParameterKey']]} if p['ParameterKey'] in parameters else {'UsePreviousValue':True})} for p in current.get('Parameters',[])]}
 data.update({'TemplateBody':json.dumps(new_template)} if new_template else {'UsePreviousTemplate':True})
 request(['cloudformation','create-change-set'],data)
 for _ in range(60):
  plan=aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',change)
  if plan['Status']=='CREATE_COMPLETE':break
  assert plan['Status']!='FAILED','Change set failed';time.sleep(2)
 else:raise RuntimeError('Change set pending')
 changes=[x['ResourceChange'] for x in plan['Changes']]
 assert changes and all(x['LogicalResourceId'] in allowed and x['Action']=='Modify' and (x['LogicalResourceId']=='Task' or x.get('Replacement')=='False') for x in changes)
 save(out/(label+'-changes.json'),{'changeSet':change,'changes':changes})
 aws('cloudformation','execute-change-set','--stack-name',stack,'--change-set-name',change)
 print(env+': '+label+' update started',flush=True)
 for _ in range(180):
  s=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]
  if s['StackStatus']=='UPDATE_COMPLETE':return {o['OutputKey']:o['OutputValue'] for o in s['Outputs']}
  assert 'ROLLBACK' not in s['StackStatus'] and 'FAILED' not in s['StackStatus'],'Stack failed; reconcile';time.sleep(3)
 raise RuntimeError('Stack update pending; reconcile')

def repair_images():
 env='staging';out=R/'release'/env;p=out/'catalog-repair-images.json';images=load(p) if p.exists() else {};repo='059393269249.dkr.ecr.us-east-1.amazonaws.com/'+CONFIG[env]['repo']
 with tempfile.TemporaryDirectory(prefix='growthcast-catalog-repair-') as td:
  root=Path(td)
  checked(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=checked(['aws','ecr','get-login-password','--region','us-east-1']))
  for kind in ['backup','restore']:
   if kind in images:continue
   prior=load(out/('before-'+kind+'-task.json'));task=aws('ecs','describe-task-definition','--task-definition',prior['outputs']['TaskDefinitionArn'])['taskDefinition'];base=task['containerDefinitions'][0]['image']
   ctx=root/kind;ctx.mkdir();files=['managed-recovery/catalog.mjs']+(['backup/capture.mjs','backup/capture-core.mjs'] if kind=='backup' else ['managed-recovery/verify.mjs'])
   for name in files:
    raw=(D/name).read_text()
    if name=='backup/capture.mjs':raw=raw.replace('      UNION ALL SELECT \'library\',id,"storageKey" FROM gc_atrium.library_file\n','')
    dest=ctx/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(raw);dest.chmod(0o444)
   (ctx/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY '+name+' /app/deployment/'+name+'\n' for name in files))
   image=repo+':catalog-'+kind+'-'+uuid.uuid4().hex[:12]
   checked(['docker','build','--platform','linux/arm64','-t',image,str(ctx)]);checked(['docker','push',image]);digest=aws('ecr','describe-images','--repository-name',CONFIG[env]['repo'],'--image-ids','imageTag='+image.split(':')[-1])['imageDetails'][0]['imageDigest'];images[kind]=repo+'@'+digest;save(p,images);print('Staging schema-8 '+kind+' checksum repair published',flush=True)

def staging_recovery(images,label):
 env='staging';out=R/'release'/env;stack=CONFIG[env]['recovery'];raw=json.dumps(template(stack))
 # Read the workflow's actual pinned task references, never stale historical receipts.
 import re
 old={kind:next(iter(set(re.findall(r'arn:aws:ecs:us-east-1:059393269249:task-definition/growthcast-portal-staging-'+family+r':\d+',raw)))) for kind,family in [('backup','backup'),('restore','restore')]}
 b=update(env,'growthcast-portal-staging-backup-job',{'ImageDigest':images['backup'].split('@')[1]},{'Task'},label=label+'-backup')
 s=update(env,'growthcast-portal-staging-restore-worker',{'Image':images['restore']},{'Task'},label=label+'-restore')
 changed=raw.replace(old['backup'],b['TaskDefinitionArn']).replace(old['restore'],s['TaskDefinitionArn'])
 workflow=update(env,stack,{}, {'Workflow','WorkflowRole'},json.loads(changed),label=label+'-workflow')
 save(out/(label+'-recovery.json'),{'backup':b,'restore':s,'workflow':workflow,'images':images,'scheduleUnchanged':True});print('Staging recovery updated; identities and schedule unchanged',flush=True)

def production_recovery():
 env='production';out=R/'release'/env;assert (out/'paused.json').exists()
 images=load(out/'images.json');stack=CONFIG[env]['recovery'];raw=json.dumps(template(stack));import re
 old={kind:next(iter(set(re.findall(r'arn:aws:ecs:us-east-1:059393269249:task-definition/growthcast-portal-production-'+kind+r':\d+',raw)))) for kind in ['backup','restore']}
 p=out/'recovery-tasks.json';tasks=load(p) if p.exists() else {}
 for kind in ['backup','restore']:
  if kind in tasks:continue
  definition=aws('ecs','describe-task-definition','--task-definition',old[kind])['taskDefinition']
  allowed=['family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','placementConstraints','requiresCompatibilities','cpu','memory','pidMode','ipcMode','proxyConfiguration','inferenceAccelerators','ephemeralStorage','runtimePlatform']
  body={k:v for k,v in definition.items() if k in allowed};assert len(body['containerDefinitions'])==1;body['containerDefinitions'][0]['image']=images[kind]
  result=request(['ecs','register-task-definition'],body);tasks[kind]=result['taskDefinition']['taskDefinitionArn'];save(p,tasks)
 for kind in tasks:raw=raw.replace(old[kind],tasks[kind])
 result=update(env,stack,{}, {'Workflow','WorkflowRole'},json.loads(raw),label='library-recovery')
 save(out/'library-recovery.json',{'tasks':tasks,'workflow':result,'images':images,'scheduleUnchanged':True});print('Production recovery updated; identities and cadence unchanged',flush=True)

if __name__=='__main__':
 if sys.argv[1]=='repair-build':repair_images()
 elif sys.argv[1]=='repair-deploy':staging_recovery(load(R/'release/staging/catalog-repair-images.json'),'catalog-repair')
 elif sys.argv[1]=='library-production':production_recovery()
 elif sys.argv[1]=='library-staging':staging_recovery(load(R/'release/staging/images.json'),'library')
 else:raise ValueError('Unknown operation')
