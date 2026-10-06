"""Independently inspect completed task cleanup and disabled database identities."""
import datetime,hashlib,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    evidence=json.loads((ROOT/'package-evidence.json').read_text())
    assert evidence['result']=='passed'
    for name,digest in evidence['sourceSha256'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'Source drift'
    assert json.loads((ROOT/'recovery-denial-evidence.json').read_text())['result']=='passed'
    count=0
    for name in ['package-probe-tasks.json','recovery-denial-tasks.json']:
        receipt=json.loads((ROOT/name).read_text())
        for item in receipt['tasks']:
            task=job.aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-backup','--tasks',item['arn'])['tasks'][0]
            assert task['lastStatus']=='STOPPED' and task['containers'][0]['exitCode']==0
            count+=1
        for arn in receipt['definitions']:
            task=job.aws('ecs','describe-task-definition','--task-definition',arn)['taskDefinition']
            assert task['status']=='INACTIVE'
            container=task['containerDefinitions'][0];assert container['readonlyRootFilesystem']
            if name=='package-probe-tasks.json':
                service=next(v['value'] for v in container['environment'] if v['name']=='GC_SERVICE')
                assert container['image']==evidence['images'][service]
                assert task['taskRoleArn'].endswith('/growthcast-portal-staging-'+service+'-runtime')
    source=Path.home()/'.config/growthcast/portal-staging'
    result=subprocess.run(['docker','run','--rm','--entrypoint','node','-v',str(ROOT.parent)+':/app/deployment:ro','-v',str(source)+':/source:ro','growthcast-supabase-preflight','/app/deployment/runtime-connections/source-audit.mjs'],capture_output=True)
    assert result.returncode==0,'Independent source audit failed'
    database=json.loads(result.stdout);assert database['result']=='passed' and len(database['disabledRoles'])==6
    (ROOT/'source-audit-evidence.json').write_text(json.dumps(database,indent=2)+'\n')
    (ROOT/'cleanup-audit-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','stoppedSuccessfulTasks':count,'temporaryDefinitionsInactive':True,'sourceHashesMatch':True,'allSixDatabaseRolesDisabled':True,'actualImageAndRoleBindingsVerified':True},indent=2)+'\n')
    print('All temporary tasks stopped, definitions inactive, source hashes matched and six database roles disabled.')
if __name__=='__main__':main()
