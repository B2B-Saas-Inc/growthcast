"""Create the add-only staging API stack and leave one healthy task running."""
import datetime,importlib.util,json,tempfile,time
from pathlib import Path
R=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('account',R.parent/'cloud-account/verify.py');account=importlib.util.module_from_spec(s);s.loader.exec_module(account)
aws=account.job.aws
STACK='growthcast-portal-staging-api'
def main():
 assert aws('sts','get-caller-identity')['Account']=='059393269249'
 assert not (R/'deployment.json').exists(),'Existing deployment requires reconciliation'
 cert=json.loads((R/'certificate.json').read_text())
 assert aws('acm','describe-certificate','--certificate-arn',cert['certificateArn'])['Certificate']['Status']=='ISSUED'
 with tempfile.TemporaryDirectory() as d:
  p=Path(d);request={'StackName':STACK,'ChangeSetName':'initial-staging-api','ChangeSetType':'CREATE','TemplateBody':(R/'foundation.json').read_text()};(p/'request.json').write_text(json.dumps(request))
  aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=p)
 for _ in range(30):
  plan=aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name','initial-staging-api')
  if plan['Status']=='CREATE_COMPLETE':break
  assert plan['Status']!='FAILED','Change set failed'
  time.sleep(2)
 else:raise RuntimeError('Change set timeout')
 changes=[x['ResourceChange'] for x in plan['Changes']]
 assert all(x['Action']=='Add' for x in changes)
 assert {x['LogicalResourceId'] for x in changes}==set(json.loads((R/'foundation.json').read_text())['Resources'])
 (R/'change.json').write_text(json.dumps({'stack':STACK,'changes':changes},indent=2)+'\n')
 account.database_action('enable')
 receipt={'stack':STACK,'status':'READY','databaseLogin':'gc_app','persistentService':True}
 (R/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n')
 try:
  aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name','initial-staging-api')
  print('Add-only staging API stack executing; restricted gc_app login enabled.',flush=True)
  for _ in range(150):
   stack=aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
   state=stack['StackStatus']
   if state=='CREATE_COMPLETE':break
   if state in ['ROLLBACK_COMPLETE','ROLLBACK_FAILED','CREATE_FAILED']:raise RuntimeError('Stack failed; reconcile resources')
   time.sleep(5)
  else:raise RuntimeError('Deployment deadline; inspect stack before further mutations')
  receipt.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),status=state,resources={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']})
  (R/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n')
  print('Staging API stack created; HTTPS and task verification pending.',flush=True)
 except Exception:
  account.database_action('disable')
  receipt.update(status='RECONCILE',databaseLogin=False)
  (R/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n')
  raise
if __name__=='__main__':main()
