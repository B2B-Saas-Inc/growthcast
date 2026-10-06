"""Explicit recovery only: release a failed execution's lock after all related tasks stop."""
import argparse,datetime,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--execution-arn',required=True);args=parser.parse_args()
    deployment=json.loads((ROOT/'deployment.json').read_text())
    execution=job.aws('stepfunctions','describe-execution','--execution-arn',args.execution_arn)
    assert execution['stateMachineArn']==deployment['StateMachineArn'] and execution['status'] in ['FAILED','TIMED_OUT','ABORTED']
    cluster='growthcast-portal-staging-backup'
    for family in ['growthcast-portal-staging-backup','growthcast-portal-staging-restore']:
        arns=set()
        for desired in ['RUNNING','STOPPED']:
            arns.update(job.aws('ecs','list-tasks','--cluster',cluster,'--family',family,'--desired-status',desired)['taskArns'])
        arns=list(arns)
        for offset in range(0,len(arns),100):
            result=job.aws('ecs','describe-tasks','--cluster',cluster,'--tasks',*arns[offset:offset+100])
            assert not result.get('failures') and all(t['lastStatus']=='STOPPED' for t in result['tasks']),'Active or stopping tasks prevent lock release'
    job.aws('dynamodb','delete-item','--table-name',deployment['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--condition-expression','#owner = :owner','--expression-attribute-names',json.dumps({'#owner':'owner'}),'--expression-attribute-values',json.dumps({':owner':{'S':args.execution_arn}}))
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executionArn':args.execution_arn,'executionStatus':execution['status'],'relatedActiveTasks':0,'conditionalOwnerRelease':True}
    path=ROOT/'lock-recovery-history.json';history=json.loads(path.read_text()) if path.exists() else [];history.append(record);path.write_text(json.dumps(history,indent=2)+'\n');print('Failed execution lock released after terminal-state and inactive-task checks.')
if __name__=='__main__':main()
