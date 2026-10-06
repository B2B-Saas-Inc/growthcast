import json,time
from pathlib import Path
from aws import aws,request
R=Path(__file__).resolve().parent;p=R/'foundation.json';t=json.loads(p.read_text());r=t['Resources'];r['EscrowBroker']={'Type':'AWS::IAM::User','Properties':{'UserName':'growthcast-portal-staging-secret-recovery-broker'}};r['EscrowBrokerAccess']={'Type':'AWS::IAM::Policy','Properties':{'PolicyName':'assume-only-secret-recovery','Users':[{'Ref':'EscrowBroker'}],'PolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':'sts:AssumeRole','Resource':{'Fn::GetAtt':['EscrowReader','Arn']}}]}}};r['EscrowReader']['Properties']['AssumeRolePolicyDocument']['Statement'][0]['Principal']={'AWS':{'Fn::GetAtt':['EscrowBroker','Arn']}};p.write_text(json.dumps(t,indent=2)+'\n')
s='growthcast-portal-staging-secret-escrow';name='scoped-recovery-broker';request(['cloudformation','create-change-set'],{'StackName':s,'ChangeSetName':name,'ChangeSetType':'UPDATE','TemplateBody':json.dumps(t),'Capabilities':['CAPABILITY_NAMED_IAM']})
for _ in range(30):
 c=aws('cloudformation','describe-change-set','--stack-name',s,'--change-set-name',name)
 if c['Status']=='CREATE_COMPLETE':break
 assert c['Status']!='FAILED';time.sleep(2)
assert {x['ResourceChange']['LogicalResourceId'] for x in c['Changes']}=={'EscrowBroker','EscrowBrokerAccess','EscrowReader'}
aws('cloudformation','execute-change-set','--stack-name',s,'--change-set-name',name)
for _ in range(60):
 state=aws('cloudformation','describe-stacks','--stack-name',s)['Stacks'][0]['StackStatus']
 if state=='UPDATE_COMPLETE':break
 assert 'ROLLBACK' not in state;time.sleep(3)
assert state=='UPDATE_COMPLETE'
print('Secret-recovery broker provisioned without access keys; can only assume the read-only escrow role.')
