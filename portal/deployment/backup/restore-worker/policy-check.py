"""Audit independent restore permissions without reading source secrets."""
import importlib.util,json,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    role=json.loads((ROOT/'deployment.json').read_text())['RoleArn'];bucket='arn:aws:s3:::growthcast-portal-staging-recovery-059393269249';checks=[]
    for action,resource,expected in [('s3:GetObjectVersion',bucket+'/staging/probe/backup.gcb','allowed'),('s3:PutObject',bucket+'/verification/staging/probe.json','allowed'),('s3:PutObject',bucket+'/staging/probe/backup.gcb','implicitDeny'),('s3:DeleteObject',bucket+'/verification/staging/probe.json','implicitDeny'),('s3:ListBucket',bucket,'implicitDeny'),('secretsmanager:GetSecretValue','*','implicitDeny'),('sts:AssumeRole','*','implicitDeny')]:
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names',action,'--resource-arns',resource)['EvaluationResults'][0]['EvalDecision'];assert actual==expected;checks.append({'action':action,'resource':resource,'decision':actual})
    for project,expected in [('growthcast-portal-staging','allowed'),('other','implicitDeny')]:
        context=[{'ContextKeyName':'kms:EncryptionContext:project','ContextKeyType':'string','ContextKeyValues':[project]},{'ContextKeyName':'kms:EncryptionContext:archive','ContextKeyType':'string','ContextKeyValues':['staging/probe/backup.gcb']}]
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names','kms:Decrypt','--resource-arns','arn:aws:kms:us-east-1:059393269249:key/83f92d33-f73f-4f86-88aa-73613fedae11','--context-entries',json.dumps(context))['EvaluationResults'][0]['EvalDecision'];assert actual==expected;checks.append({'action':'kms:Decrypt','projectContext':project,'decision':actual})
    (ROOT/'policy-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','checks':checks},indent=2)+'\n');print('Nine independent restore role permission cases passed.')
if __name__=='__main__':main()
