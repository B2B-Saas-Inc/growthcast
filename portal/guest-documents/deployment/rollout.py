"""Staging-only coordinated release. Explicit commands; no actions at import time."""
from prepare import *
from template import prepare
import subprocess,time

def migration(expected=10):
 assert (OUT/'baseline-verified.json').exists() and (OUT/'paused.json').exists()
 if (OUT/'migration.json').exists():return
 value=legacy.connection('staging')
 with tempfile.TemporaryDirectory(prefix='growthcast-guest-migrate-') as td:
  root=Path(td);root.chmod(0o700)
  (root/'ca.crt').write_text(value['databaseCa'])
  (root/'admin-url').write_text((Path.home()/'.config/growthcast/portal-staging/database-url').read_text().strip())
  def control(mode):
   return checked(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-e','SUPABASE_PROJECT_REF=saedetvoolpdysiyjwvg','-v',str(P/'deployment')+':/boundary/deployment:ro','-v',td+':/private','growthcast-atrium-runtime','/boundary/deployment/file-library/migration-role.mjs',mode])
  try:
   control('enable');isolated=root/'isolated';isolated.mkdir(mode=0o700)
   for name in ['database-url','ca.crt']:shutil.copy2(root/name,isolated/name)
   cmd=['docker','run','--rm','--user','0','--entrypoint','node','-e','GC_EXPECTED_MIGRATIONS='+str(expected),'-v',str(isolated)+':/migration:ro','-v',str(P/'guest-documents/runtime/migrate-live.mjs')+':/app/guest-documents/runtime/migrate-live.mjs:ro',load(OUT/'images.json')['guest'],'/app/guest-documents/runtime/migrate-live.mjs']
   for _ in range(18):
    result=subprocess.run(cmd,capture_output=True)
    if result.returncode==0:break
    if b'28P01' not in result.stderr:raise RuntimeError('Candidate migration failed; provider details withheld')
    time.sleep(5)
   assert result.returncode==0,'Migration credential propagation failed'
   receipt=json.loads(result.stdout);assert len(receipt['migrations'])==expected;save(OUT/'migration.json',receipt)
  finally:
   if (root/'role-enable-attempted').exists():control('disable')
 print('Staging migrations verified; migration login disabled',flush=True)


def update(stack,template,allowed):
 current,_=legacy.info(stack)
 if legacy.template(stack)==template:return
 change='guest-'+uuid.uuid4().hex[:12]
 legacy.request(['cloudformation','create-change-set'],{'StackName':stack,'ChangeSetName':change,'ChangeSetType':'UPDATE','Capabilities':['CAPABILITY_NAMED_IAM'],'Parameters':[{'ParameterKey':p['ParameterKey'],'UsePreviousValue':True} for p in current.get('Parameters',[])],'TemplateBody':json.dumps(template)})
 for _ in range(60):
  plan=aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',change)
  if plan['Status']=='CREATE_COMPLETE':break
  assert plan['Status']!='FAILED','Change set creation failed';time.sleep(2)
 else:raise RuntimeError('Change set pending')
 changes=[x['ResourceChange'] for x in plan['Changes']]
 assert changes and all(x['LogicalResourceId'] in allowed and x['Action'] in allowed[x['LogicalResourceId']] and (x['Action']=='Add' or x['LogicalResourceId']=='Task' or x.get('Replacement')=='False') for x in changes)
 save(OUT/'api-changes.json',{'changeSet':change,'changes':changes})
 aws('cloudformation','execute-change-set','--stack-name',stack,'--change-set-name',change)
 print('Staging existing task update started',flush=True)
 for _ in range(180):
  s=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]
  if s['StackStatus']=='UPDATE_COMPLETE':return
  assert 'ROLLBACK' not in s['StackStatus'] and 'FAILED' not in s['StackStatus'],'Stack failed; reconcile';time.sleep(3)
 raise RuntimeError('Stack update pending; reconcile')


def api():
 assert (OUT/'migration.json').exists()
 images=load(OUT/'images.json');t=prepare(load(OUT/'before-api.json')['template'],{k:images[k] for k in ['api','guest']})
 t['Resources']['Service']['Properties']['DesiredCount']=load(OUT/'service-before.json')['desiredCount']
 update(legacy.CONFIG['staging']['api'],t,{**{k:['Modify'] for k in ['Task','Service','LoadBalancerSecurityGroup','ApiRoute']},**{k:['Add'] for k in ['GuestIngress','GuestTarget','GuestRoute']}})
 _,outputs=legacy.info(legacy.CONFIG['staging']['api']);save(OUT/'api.json',{'outputs':outputs,'images':images,'template':t})


# Legacy release coordination is retained, with a separate record directory.
# Register the shared helper under the name expected by its local imports.
sys.modules['release']=legacy
rr=module('guest_recovery_release',P/'deployment/file-library/recovery-release.py')
# The Library rollout locates recovery-release relative to R, so reuse its actual
# file while restoring the guest record directory immediately after import.
legacy.R=P/'deployment/file-library'
old=module('guest_legacy_rollout',P/'deployment/file-library/rollout.py')
legacy.R=R
old.R=R;old.rr.R=R

def pause():
 checked(['docker','info','--format','{{.ServerVersion}}'],timeout=20)
 old.pause('staging')

if __name__=='__main__':
 {'pause':pause,'migrate':migration,'api':api,
  'recovery':lambda:rr.staging_recovery(load(OUT/'images.json'),'guest'),
  'alias':lambda:old.alias('staging')}[sys.argv[1]]()
