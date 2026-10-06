"""Additive production document migration and bounded existing-task rollout."""
from pathlib import Path
import sys,json,copy,tempfile,shutil,subprocess,time,uuid,urllib.parse
import provider as q
p=q.p;P=q.P;R=q.R;OUT=q.OUT

def update(stack,target,allowed):
 current,_=p.info(stack)
 if p.template(stack)==target:return
 change='documents-'+uuid.uuid4().hex[:12]
 p.request(['cloudformation','create-change-set'],{'StackName':stack,'ChangeSetName':change,'ChangeSetType':'UPDATE','Capabilities':['CAPABILITY_NAMED_IAM'],'Parameters':[{'ParameterKey':x['ParameterKey'],'UsePreviousValue':True} for x in current.get('Parameters',[])],'TemplateBody':json.dumps(target)})
 for _ in range(30):
  plan=p.aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',change)
  if plan['Status']=='CREATE_COMPLETE':break
  assert plan['Status']!='FAILED';time.sleep(2)
 else:raise RuntimeError('Change set pending')
 changes=[x['ResourceChange'] for x in plan['Changes']]
 assert all(x['LogicalResourceId'] in allowed and x['Action'] in allowed[x['LogicalResourceId']] and (x['Action']=='Add' or x['LogicalResourceId']=='Task' or x.get('Replacement')=='False') for x in changes)
 p.save(OUT/(stack+'-changes.json'),{'changeSet':change,'changes':changes})
 p.aws('cloudformation','execute-change-set','--stack-name',stack,'--change-set-name',change)
 print('Production stack update started: '+stack,flush=True)
def pause():
 assert p.load(OUT/'baseline-verified.json')['status']=='VERIFIED'
 rec=p.load(OUT/'before-recovery.json')['outputs'];rule=rec['ScheduleArn'].split('/')[-1]
 if not (OUT/'schedule-before.json').exists():p.save(OUT/'schedule-before.json',p.aws('events','describe-rule','--name',rule))
 p.aws('events','disable-rule','--name',rule)
 assert not p.aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
 assert not p.aws('dynamodb','get-item','--table-name',rec['LockTable'],'--key',json.dumps({'environment':{'S':'production'}}),'--consistent-read').get('Item')
 p.save(OUT/'paused.json',{'at':p.c.now(),'scheduleDisabled':True,'recoveryIdle':True,'apiRunning':True})
def migrate():
 assert (OUT/'paused.json').exists()
 if (OUT/'migration.json').exists():return
 c=p.connection('production')
 with tempfile.TemporaryDirectory(prefix='gc-production-doc-migrate-') as td:
  root=Path(td);root.chmod(0o700);(root/'ca.crt').write_text(c['databaseCa']);parts=urllib.parse.urlsplit(c['databaseUrl']);password=(p.c.PRIVATE/'database-password').read_text().strip();admin=urllib.parse.urlunsplit((parts.scheme,'postgres.mdjldxussxdtcjxsoesr:'+urllib.parse.quote(password,safe='')+'@'+parts.hostname+':'+str(parts.port or 5432),parts.path,'',''));(root/'admin-url').write_text(admin)
  def control(mode):return p.checked(['docker','run','--rm','--user','0','--entrypoint','bun','-e','SUPABASE_PROJECT_REF=mdjldxussxdtcjxsoesr','-v',str(P/'deployment/file-library/migration-role.mjs')+':/migration-role.mjs:ro','-v',td+':/private','growthcast-atrium-runtime','/migration-role.mjs',mode])
  try:
   control('enable');isolated=root/'isolated';isolated.mkdir(mode=0o700)
   for name in ['database-url','ca.crt']:shutil.copy2(root/name,isolated/name)
   cmd=['docker','run','--rm','--user','0','--entrypoint','node','-e','GC_EXPECTED_MIGRATIONS=13','-v',str(isolated)+':/migration:ro',p.load(OUT/'images.json')['guest'],'/app/guest-documents/runtime/migrate-live.mjs']
   for _ in range(18):
    result=subprocess.run(cmd,capture_output=True)
    if result.returncode==0:break
    if b'28P01' not in result.stderr:raise RuntimeError('Production migration refused: '+result.stderr.decode()[-300:])
    time.sleep(5)
   assert result.returncode==0
   receipt=json.loads(result.stdout);assert len(receipt['migrations'])==13;p.save(OUT/'migration.json',receipt)
  finally:
   if (root/'role-enable-attempted').exists():control('disable')
 print('Production schema13 applied and guarded; migration login disabled',flush=True)
def api():
 assert (OUT/'migration.json').exists()
 raw=(R.parent/'template.py').read_text().replace('growthcast-portal-staging-backup','growthcast-portal-production');raw=q.transform(raw)
 m={'__name__':'prod_api_template'};exec(compile(raw,str(R.parent/'template.py'),'exec'),m)
 images=p.load(OUT/'images.json');t=m['prepare'](p.load(OUT/'before-api.json')['template'],{k:images[k] for k in ['api','guest']})
 task=t['Resources']['Task']['Properties'];task['Volumes'].append({'Name':'signing'})
 guest=next(c for c in task['ContainerDefinitions'] if c['Name']=='guest')
 guest.update({'EntryPoint':['node'],'Command':['/app/guest-documents/runtime/signing-start.mjs'],'StopTimeout':120})
 guest['Environment'].append({'Name':'GC_SIGNING_SERVICE','Value':'delivery'})
 guest['MountPoints'] += [{'SourceVolume':'signing','ContainerPath':'/run/signing','ReadOnly':False},{'SourceVolume':'delivered','ContainerPath':'/run/delivered','ReadOnly':True}]
 p.save(OUT/'api-template.json',t)
 update('growthcast-portal-production-api',t,{'Task':['Modify'],'Service':['Modify'],'LoadBalancerSecurityGroup':['Modify'],'ApiRoute':['Modify'],'GuestIngress':['Add'],'GuestTarget':['Add'],'GuestRoute':['Add']})
def services():
 assert (OUT/'migration.json').exists()
 n=p.load(OUT/'network.json');old=p.load(R.parent/'signing-service/network.json');raw=json.dumps(p.template('growthcast-portal-staging-signing-services'))
 for key,value in old.items():raw=raw.replace(value,n[key])
 oldlistener=p.load(R.parent/'signing-rollout/release/staging/before-api.json')['outputs']['ListenerArn'];raw=raw.replace(oldlistener,p.load(OUT/'before-api.json')['outputs']['ListenerArn'])
 oldprovider=p.load(R.parent/'signing-service/deployment.json')['outputs']['SecurityGroup'];newprovider=q.outputs('growthcast-portal-production-signing-provider')['SecurityGroup'];raw=raw.replace(oldprovider,newprovider)
 raw=q.transform(raw).replace('growthcast-portal-production-backup-execution','growthcast-portal-production-execution')
 t=json.loads(raw)
 for resource in t['Resources'].values():
  if resource['Type']=='AWS::ECS::TaskDefinition':resource['Properties']['ContainerDefinitions'][0]['Image']=p.load(OUT/'images.json')['guest']
  if resource['Type']=='AWS::ElasticLoadBalancingV2::ListenerRule':
   for c in resource['Properties']['Conditions']:
    if c['Field']=='path-pattern':c['Values']=[v.replace('/api/branding/logo/team/3','/api/branding/logo/team/'+str(p.load(OUT/'provider-identity.json')['teamId'])) for v in c['Values']]
 t['Parameters']['DesiredCount']['Default']=1
 # Credentials were initialized NOLOGIN and are activated only with matching schema13.
 p.c.supa('/v1/projects/mdjldxussxdtcjxsoesr/database/query',{'query':"ALTER ROLE gc_gateway LOGIN VALID UNTIL 'infinity'; ALTER ROLE gc_lifecycle LOGIN VALID UNTIL 'infinity';",'read_only':False})
 q.create_stack('growthcast-portal-production-signing-services',t,OUT/'services-stack.json')
if __name__=='__main__':{'pause':pause,'migrate':migrate,'api':api,'services':services}[sys.argv[1]]()
