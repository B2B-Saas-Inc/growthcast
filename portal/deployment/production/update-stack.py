from common import *
import sys,uuid
kind=sys.argv[1];assert kind in ['api','recovery']
name='growthcast-portal-production-'+kind;template=load(R/(kind+'-foundation.json'));change='release-'+uuid.uuid4().hex
assert aws('cloudformation','describe-stacks','--stack-name',name)['Stacks'][0]['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE']
aws_request(['cloudformation','create-change-set'],{'StackName':name,'ChangeSetName':change,'ChangeSetType':'UPDATE','TemplateBody':json.dumps(template),'Capabilities':['CAPABILITY_NAMED_IAM']})
for _ in range(60):
 p=aws('cloudformation','describe-change-set','--stack-name',name,'--change-set-name',change)
 if p['Status']=='CREATE_COMPLETE':break
 assert p['Status']!='FAILED';time.sleep(2)
else:raise RuntimeError('Change set pending')
changes=[c['ResourceChange'] for c in p['Changes']];allowed={'Task','Service'} if kind=='api' else {'Schedule','FreshnessAlarm'}
assert all(c['LogicalResourceId'] in allowed and c['Action']=='Modify' and c.get('Replacement') in ['False','True','Conditional'] for c in changes)
save(R/(kind+'-release-change.json'),{'changeSet':change,'changes':changes})
aws('cloudformation','execute-change-set','--stack-name',name,'--change-set-name',change)
print('Reviewed '+kind+' update executing.',flush=True)
for _ in range(150):
 s=aws('cloudformation','describe-stacks','--stack-name',name)['Stacks'][0]
 if s['StackStatus']=='UPDATE_COMPLETE':break
 assert not ('ROLLBACK' in s['StackStatus'] or 'FAILED' in s['StackStatus']);time.sleep(4)
else:raise RuntimeError('Stack update pending; reconcile before another update')
save(R/(kind+'-resources.json'),{x['OutputKey']:x['OutputValue'] for x in s['Outputs']});print(kind+' CloudFormation reconciled.',flush=True)
