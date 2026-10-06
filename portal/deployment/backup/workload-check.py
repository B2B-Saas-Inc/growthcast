"""Read-only IAM policy simulation, not an ECS runtime acceptance test."""
import datetime
import json
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('source',Path(__file__).with_name('store-secret.py'));source=module_from_spec(spec);spec.loader.exec_module(source)
aws=source.aws
root=Path(__file__).resolve().parent
secret=json.loads((root/'secret-evidence.json').read_text())
key=json.loads((root/'../offhost/kms-configuration.json').read_text())['keyArn']
role=secret['taskRoleArn']
context=[{'ContextKeyName':'kms:EncryptionContext:project','ContextKeyValues':['growthcast-portal-staging'],'ContextKeyType':'string'},
 {'ContextKeyName':'kms:EncryptionContext:archive','ContextKeyValues':['staging/probe/backup.gcb'],'ContextKeyType':'string'},
 {'ContextKeyName':'cloudwatch:namespace','ContextKeyValues':['GrowthCast/PortalRecovery'],'ContextKeyType':'string'}]
cases=[('secretsmanager:GetSecretValue',secret['secretArn'],'allowed'),
 ('secretsmanager:GetSecretValue','arn:aws:secretsmanager:us-east-1:059393269249:secret:unrelated-abcdef','implicitDeny'),
 ('secretsmanager:PutSecretValue',secret['secretArn'],'implicitDeny'),
 ('s3:PutObject','arn:aws:s3:::growthcast-portal-staging-recovery-059393269249/staging/probe/backup.gcb','allowed'),
 ('s3:GetObject','arn:aws:s3:::growthcast-portal-staging-recovery-059393269249/staging/probe/backup.gcb','implicitDeny'),
 ('s3:DeleteObject','arn:aws:s3:::growthcast-portal-staging-recovery-059393269249/staging/probe/backup.gcb','implicitDeny'),
 ('s3:PutObject','arn:aws:s3:::growthcast-portal-staging-recovery-059393269249/outside/probe','implicitDeny'),
 ('kms:Encrypt',key,'allowed'),('kms:Decrypt',key,'implicitDeny'),('cloudwatch:PutMetricData','*','allowed')]
results=[]
for action,resource,expected in cases:
    result=aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names',action,
        '--resource-arns',resource,'--context-entries',json.dumps(context))['EvaluationResults'][0]
    assert result['EvalDecision']==expected,(action,result['EvalDecision'])
    results.append({'action':action,'resource':resource,'decision':result['EvalDecision']})
for entry in context:
    if entry['ContextKeyName'] in ['kms:EncryptionContext:project','cloudwatch:namespace']:entry['ContextKeyValues']=['wrong-scope']
for action,resource in [('kms:Encrypt',key),('cloudwatch:PutMetricData','*')]:
    result=aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names',action,
        '--resource-arns',resource,'--context-entries',json.dumps(context))['EvaluationResults'][0]
    assert result['EvalDecision']=='implicitDeny'
    results.append({'action':action,'scope':'wrong','decision':result['EvalDecision']})
trust=aws('iam','get-role','--role-name','growthcast-portal-staging-backup-task')['Role']['AssumeRolePolicyDocument']
statement=trust['Statement'][0]
assert statement['Principal']=={'Service':'ecs-tasks.amazonaws.com'}
assert statement['Condition']['StringEquals']['aws:SourceAccount']=='059393269249'
assert statement['Condition']['ArnLike']['aws:SourceArn']=='arn:aws:ecs:us-east-1:059393269249:*'
(root/'workload-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'roleArn':role,'trust':trust,'simulation':results,'limitation':'Identity-policy simulation and trust inspection only; no ECS task launched and no schedule enabled.'},indent=2)+'\n')
print('Twelve workload policy cases passed; ECS-only trust inspected. Runtime task acceptance remains open.')
