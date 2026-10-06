"""Read-only IAM checks for the workflow and scheduler control roles."""
import importlib.util,json,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    workflow=json.loads((ROOT/'workflow.json').read_text());role='arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-workflow';cluster=workflow['States']['Backup']['Parameters']['Cluster'];cases=[]
    for resource,expected in [(workflow['States']['Backup']['Parameters']['TaskDefinition'],'allowed'),(workflow['States']['Restore']['Parameters']['TaskDefinition'],'allowed'),('arn:aws:ecs:us-east-1:059393269249:task-definition/other:1','implicitDeny')]:
        context=[{'ContextKeyName':'ecs:cluster','ContextKeyType':'string','ContextKeyValues':[cluster]}]
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names','ecs:RunTask','--resource-arns',resource,'--context-entries',json.dumps(context))['EvaluationResults'][0]['EvalDecision'];assert actual==expected;cases.append({'action':'ecs:RunTask','resource':resource,'decision':actual})
    for action,resource in [('secretsmanager:GetSecretValue','*'),('kms:Decrypt','*'),('s3:PutObject','arn:aws:s3:::growthcast-portal-staging-recovery-059393269249/verification/staging/probe.json'),('iam:PassRole','arn:aws:iam::059393269249:role/other')]:
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names',action,'--resource-arns',resource)['EvaluationResults'][0]['EvalDecision'];assert actual=='implicitDeny';cases.append({'action':action,'resource':resource,'decision':actual})
    role='arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-schedule'
    for resource,expected in [(json.loads((ROOT/'deployment.json').read_text())['StateMachineArn'],'allowed'),('arn:aws:states:us-east-1:059393269249:stateMachine:other','implicitDeny')]:
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names','states:StartExecution','--resource-arns',resource)['EvaluationResults'][0]['EvalDecision'];assert actual==expected;cases.append({'action':'states:StartExecution','resource':resource,'decision':actual})
    (ROOT/'policy-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','checks':cases},indent=2)+'\n');print('Nine workflow/scheduler permission cases passed.')
if __name__=='__main__':main()
