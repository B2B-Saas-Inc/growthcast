import json,subprocess,tempfile,time
from pathlib import Path
def aws(*args,env=None):
 r=subprocess.run(['aws',*args,'--region','us-east-1','--output','json'],capture_output=True,text=True,env=env)
 if r.returncode:raise RuntimeError('AWS operation failed: '+args[0]+' '+args[1])
 return json.loads(r.stdout) if r.stdout.strip() else {}
def request(args,data):
 with tempfile.TemporaryDirectory() as d:
  p=Path(d)/'request.json';p.write_text(json.dumps(data));p.chmod(0o600)
  return aws(*args,'--cli-input-json','file://'+str(p))
def create_stack(name,template):
 assert aws('sts','get-caller-identity')['Account']=='059393269249'
 plan=request(['cloudformation','create-change-set'],{'StackName':name,'ChangeSetName':'initial-foundation','ChangeSetType':'CREATE','TemplateBody':json.dumps(template),'Capabilities':['CAPABILITY_NAMED_IAM']})
 for _ in range(40):
  p=aws('cloudformation','describe-change-set','--stack-name',name,'--change-set-name','initial-foundation')
  if p['Status']=='CREATE_COMPLETE':break
  assert p['Status']!='FAILED';time.sleep(2)
 assert p['Status']=='CREATE_COMPLETE' and all(c['ResourceChange']['Action']=='Add' for c in p['Changes'])
 aws('cloudformation','execute-change-set','--stack-name',name,'--change-set-name','initial-foundation')
 for _ in range(100):
  s=aws('cloudformation','describe-stacks','--stack-name',name)['Stacks'][0]
  if s['StackStatus']=='CREATE_COMPLETE':return {o['OutputKey']:o['OutputValue'] for o in s['Outputs']}
  assert 'ROLLBACK' not in s['StackStatus'] and 'FAILED' not in s['StackStatus'];time.sleep(3)
 raise RuntimeError('Creation still pending; reconcile before retrying')
