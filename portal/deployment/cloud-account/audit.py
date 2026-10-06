"""Independent task, source-state and private-object cleanup acceptance."""
import datetime,hashlib,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    evidence=json.loads((ROOT/'package-evidence.json').read_text());assert evidence['result']=='passed'
    for name,digest in evidence['sourceSha256'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'Source drift'
    receipt=json.loads((ROOT/'package-probe-tasks.json').read_text());assert len(receipt['tasks'])==1
    for item in receipt['tasks']:
        task=job.aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-backup','--tasks',item['arn'])['tasks'][0]
        assert task['lastStatus']=='STOPPED'
        assert next(c for c in task['containers'] if c['name']=='probe')['exitCode']==0
    for arn in receipt['definitions']:
        task=job.aws('ecs','describe-task-definition','--task-definition',arn)['taskDefinition'];assert task['status']=='INACTIVE'
        assert task['taskRoleArn']=='arn:aws:iam::059393269249:role/growthcast-portal-staging-atrium-runtime'
        app=next(c for c in task['containerDefinitions'] if c['name']=='probe');mail=next(c for c in task['containerDefinitions'] if c['name']=='mail')
        assert app['image']==evidence['images']['atrium'] and mail['image']==evidence['images']['mail'] and app['readonlyRootFilesystem']
        assert hashlib.sha256(app['command'][-1].encode()).hexdigest()==evidence['executedProbeSha256']
        env={v['name']:v['value'] for v in app['environment']};assert env['FIXTURE_PREFIX']==evidence['fixturePrefix']
        assert {name:hashlib.sha256(value.encode()).hexdigest() for name,value in json.loads(env['DRIVER_SOURCES']).items()}==evidence['driverSha256']
    source=Path.home()/'.config/growthcast/portal-staging'
    result=subprocess.run(['docker','run','--rm','--entrypoint','node','-v',str(ROOT.parent)+':/app/deployment:ro','-v',str(source)+':/source:ro','-e','FIXTURE_PREFIX='+evidence['fixturePrefix'],'growthcast-supabase-preflight','/app/deployment/cloud-account/state.mjs'],capture_output=True)
    assert result.returncode==0,'Independent managed state check failed'
    state=json.loads(result.stdout);assert state==json.loads((ROOT/'before-state.json').read_text())==json.loads((ROOT/'after-state.json').read_text())
    (ROOT/'audit-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','stoppedTask':True,'inactiveDefinition':True,'actualCodeDriversImagesAndRoleMatch':True,'unchangedAtriumTables':len(state['digests']),'allSixDatabaseRolesDisabled':True,'fixtureObjectsAbsent':True,'sourceHashesMatch':True},indent=2)+'\n')
    print('Independent audit verifies stopped task, image/code/role bindings, all source rows restored, fixture objects absent and all runtime logins disabled.')
if __name__=='__main__':main()
