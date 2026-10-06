"""Read-only acceptance of packaged delivery receipts and cloud probe cleanup."""
import datetime,hashlib,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    evidence=json.loads((ROOT/'package-evidence.json').read_text())
    tasks=json.loads((ROOT/'package-probe-tasks.json').read_text())
    assert evidence['result']=='passed'
    for name,digest in evidence['sourceSha256'].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'Acceptance source drift'
    for result in evidence['probes']:
        assert result['uid']==(1000 if result['service']=='atrium' else 1001)
        assert result['taskRoleOnly'] and result['plaintextRemoved'] and result['privateFileConsumption']
    for item in tasks['tasks']:
        state=job.aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-backup','--tasks',item['arn'])['tasks'][0]
        assert state['lastStatus']=='STOPPED' and state['containers'][0]['exitCode']==0
    for arn in tasks['definitions']:
        task=job.aws('ecs','describe-task-definition','--task-definition',arn)['taskDefinition']
        assert task['status']=='INACTIVE'
        container=task['containerDefinitions'][0]
        service=next(v['value'] for v in container['environment'] if v['name']=='GC_SERVICE')
        assert container['image']==evidence['images'][service]
        assert container['readonlyRootFilesystem']
        assert task['taskRoleArn'].endswith('/growthcast-portal-staging-'+service+'-runtime')
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','sourceHashesMatch':True,'stoppedSuccessfulTasks':len(tasks['tasks']),'inactiveDefinitions':len(tasks['definitions']),'separateRuntimeRolesAndPinnedImages':True}
    (ROOT/'package-audit-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Package receipt, source hashes, role/image bindings and task cleanup verified.')
if __name__=='__main__':main()
