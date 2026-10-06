"""Run one fresh backup-to-restore execution and prove exclusive lock behavior."""
import datetime,importlib.util,json,time,uuid,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def inspect_execution(arn,deployment,lock_checks=False):
    excluded=False
    for _ in range(240):
        execution=job.aws('stepfunctions','describe-execution','--execution-arn',arn)
        if lock_checks and not excluded:
            lock=job.aws('dynamodb','get-item','--table-name',deployment['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
            if lock:
                assert lock['owner']['S']==arn
                for operation,args in [('put-item',['--item',json.dumps({'environment':{'S':'staging'},'owner':{'S':'acceptance-contender'}}),'--condition-expression','attribute_not_exists(environment)']),('delete-item',['--key',json.dumps({'environment':{'S':'staging'}}),'--condition-expression','#owner = :owner','--expression-attribute-names',json.dumps({'#owner':'owner'}),'--expression-attribute-values',json.dumps({':owner':{'S':'acceptance-contender'}})])]:
                    denied=subprocess.run(['docker','run','--rm','-v',str(Path.home()/'.aws')+':/root/.aws','-e','AWS_DEFAULT_REGION=us-east-1',job.IMAGE,'dynamodb',operation,'--table-name',deployment['LockTable'],*args],capture_output=True)
                    assert denied.returncode!=0 and b'ConditionalCheckFailedException' in denied.stderr,'Exclusive lock boundary failed'
                current=job.aws('dynamodb','get-item','--table-name',deployment['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read')['Item'];assert current==lock;excluded=True
        if execution['status']!='RUNNING':break
        time.sleep(5)
    else:raise RuntimeError('Execution still active; do not release its lock')
    if execution['status']!='SUCCEEDED':
        (ROOT/'failed-execution.json').write_text(json.dumps({k:execution.get(k) for k in ['executionArn','status','error','cause']},indent=2)+'\n');raise RuntimeError('Workflow failed; its lock remains retained for inspection')
    result=json.loads(execution['output']);assert result['status']=='VERIFIED'
    assert not job.aws('dynamodb','get-item','--table-name',deployment['LockTable'],'--key',json.dumps({'environment':{'S':'staging'}}),'--consistent-read').get('Item')
    logs=job.aws('logs','get-log-events','--log-group-name','/growthcast/portal/staging/backup','--log-stream-name','restore/restore/'+result['restoreTask'].split('/')[-1],'--start-from-head')['events']
    states=[json.loads(x['message']) for x in logs if x['message'].startswith('{')];assert len(states)==1 and states[0]['stage']=='VERIFIED'
    for task_arn in [result['backupTask'],result['restoreTask']]:
        task=job.aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-backup','--tasks',task_arn)['tasks'][0];assert task['lastStatus']=='STOPPED' and task['containers'][0]['exitCode']==0
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executionArn':arn,'status':'SUCCEEDED','output':result,'verification':states[0],'lockReleased':True,'independentVerificationPublished':True,'competingLockAndWrongOwnerReleaseDenied':excluded,'bothTasksStoppedSuccessfully':True,'scheduleEnabled':False}
    return record

def main():
    assert not (ROOT/'acceptance.json').exists(),'Existing acceptance must not repeat silently'
    deployment=json.loads((ROOT/'deployment.json').read_text());assert deployment['scheduleEnabled'] is False
    result=job.aws('stepfunctions','start-execution','--state-machine-arn',deployment['StateMachineArn'],'--name','acceptance-'+str(uuid.uuid4()),'--input','{}')
    (ROOT/'execution.json').write_text(json.dumps(result,indent=2)+'\n');print('Backup-to-restore workflow started; schedule remains disabled.',flush=True)
    record=inspect_execution(result['executionArn'],deployment,True);assert record['competingLockAndWrongOwnerReleaseDenied'];(ROOT/'acceptance.json').write_text(json.dumps(record,indent=2)+'\n');print('Fresh backup, exact receipt handoff, autonomous restore and exclusive lock acceptance passed.')
if __name__=='__main__':main()
