"""Cloud synthetic account and private-file acceptance."""
import datetime,hashlib,importlib.util,json,tempfile,time,subprocess,os,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
spec=importlib.util.spec_from_file_location('connections',ROOT.parent/'runtime-connections/deploy.py');connections=importlib.util.module_from_spec(spec);spec.loader.exec_module(connections)
def database_action(action):
    source=Path.home()/'.config/growthcast/portal-staging'
    result=subprocess.run(['docker','run','--rm','--entrypoint','node','-v',str(ROOT.parent)+':/app/deployment:ro','-v',str(source)+':/source:ro','growthcast-supabase-preflight','/app/deployment/cloud-account/role-control.mjs',action],capture_output=True)
    assert result.returncode==0,'Restricted account role operation failed'
def main():
    assert not (ROOT/'fixture.json').exists(),'Reconcile prior fixture before rerunning'
    assert not (ROOT/'package-evidence.json').exists(),'Review existing acceptance before rerunning'
    deployment=json.loads((ROOT.parent/'runtime-connections/deployment.json').read_text());assert set(deployment['versions'])=={'atrium','documenso'}
    resources=json.loads((ROOT.parent/'runtime-secrets/deployment.json').read_text())['resources']
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0];out={i['OutputKey']:i['OutputValue'] for i in stack['Outputs']}
    code=(ROOT/'probe.mjs').read_text()
    fixture='cloud-'+uuid.uuid4().hex[:16]
    drivers={name:(ROOT.parent/'runtime/test'/source).read_text() for name,source in [('auth.mjs','atrium-auth.check.mjs'),('storage.mjs','atrium-storage.check.mjs')]}
    (ROOT/'fixture.json').write_text(json.dumps({'prefix':fixture},indent=2)+'\n')
    expected_pins=json.loads((ROOT.parent/'runtime-connections/pins.json').read_text())
    assert set(expected_pins)=={'atrium','documenso'},'Provisioned version pins required'
    for service in ['atrium']:
        result=subprocess.run(['docker','run','--rm','--entrypoint','cat','growthcast-'+service+'-runtime','/boundary/deployment/runtime-connections/pins.json'],capture_output=True)
        assert result.returncode==0 and json.loads(result.stdout)==expected_pins,'Rebuild application images after provisioning connection versions'
    images={}
    repo=out['RepositoryUri']
    assert repo=='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'
    with tempfile.TemporaryDirectory() as d:
        env={**os.environ,'DOCKER_CONFIG':d}
        password=job.command(['ecr','get-login-password'])
        result=subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=password,capture_output=True,env=env)
        assert result.returncode==0,'Registry login failed'
        for service in ['atrium']:
            tag='runtime-'+service+'-'+uuid.uuid4().hex[:12]
            for args in [['tag','growthcast-'+service+'-runtime',repo+':'+tag],['push',repo+':'+tag]]:
                result=subprocess.run(['docker',*args],capture_output=True,env=env)
                assert result.returncode==0,'Runtime image publication failed'
            digest=job.aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
            images[service]=repo+'@'+digest
            print('Published digest-pinned '+service+' application package.',flush=True)
        tag='cloud-mail-'+uuid.uuid4().hex[:12]
        mail='maildev/maildev@sha256:082ec5ee92266c6e17493998ff1bf1c3eb70604b159fbeeaa435ee777f5cc953'
        for args in [['tag',mail,repo+':'+tag],['push',repo+':'+tag]]:
            result=subprocess.run(['docker',*args],capture_output=True,env=env);assert result.returncode==0,'Capture image publication failed'
        digest=job.aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
        images['mail']=repo+'@'+digest
    (ROOT/'package-images.json').write_text(json.dumps(images,indent=2)+'\n')
    source=Path.home()/'.config/growthcast/portal-staging'
    state_command=['docker','run','--rm','--entrypoint','node','-v',str(ROOT.parent)+':/app/deployment:ro','-v',str(source)+':/source:ro','-e','FIXTURE_PREFIX='+fixture,'growthcast-supabase-preflight','/app/deployment/cloud-account/state.mjs']
    before=subprocess.run(state_command,capture_output=True);assert before.returncode==0,'Preflight source state audit failed'
    before=json.loads(before.stdout);(ROOT/'before-state.json').write_text(json.dumps(before,indent=2)+'\n')
    definitions=[];tasks=[];results=[];enabled=False
    try:
        database_action('enable');enabled=True
        for service in ['atrium']:
            role=resources[service.title()+'RoleArn']
            env={'GC_SERVICE':service,'FIXTURE_PREFIX':fixture,'DRIVER_SOURCES':json.dumps(drivers)}
            definition={'family':'growthcast-portal-staging-account-probe','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'1024','memory':'2048','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'taskRoleArn':role,'executionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-execution','volumes':[{'name':name} for name in ['delivered','origin','connections','storage','config','tmp']],'containerDefinitions':[{'name':'probe','image':images[service],'essential':True,'user':'1000:1000' if service=='atrium' else '1001:65533','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['/usr/local/bin/bun' if service=='atrium' else '/usr/local/bin/node'],'command':['--input-type=module','-e',code],'environment':[{'name':k,'value':v} for k,v in env.items()],'mountPoints':[{'sourceVolume':name,'containerPath':'/tmp' if name=='tmp' else '/run/'+name,'readOnly':False} for name in ['delivered','origin','connections','storage','config','tmp']],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':out['LogGroup'],'awslogs-region':'us-east-1','awslogs-stream-prefix':'account-probe'}}}]}
            definition['containerDefinitions'][0]['dependsOn']=[{'containerName':'mail','condition':'HEALTHY'}]
            definition['containerDefinitions'].append({'name':'mail','image':images['mail'],'essential':False,'memoryReservation':128,'healthCheck':{'command':['CMD-SHELL','wget -q -O - http://127.0.0.1:1080/healthz || exit 1'],'interval':5,'timeout':3,'retries':5,'startPeriod':10}})
            with tempfile.TemporaryDirectory() as d:
                folder=Path(d);(folder/'request.json').write_text(json.dumps(definition));taskdef=job.aws('ecs','register-task-definition','--cli-input-json','file:///input/request.json',mount=folder)['taskDefinition']['taskDefinitionArn'];definitions.append(taskdef)
                request={'cluster':out['ClusterArn'],'taskDefinition':taskdef,'launchType':'FARGATE','count':1,'platformVersion':'1.4.0','networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['SecurityGroupId']],'assignPublicIp':'ENABLED'}}};(folder/'request.json').write_text(json.dumps(request));launched=job.aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=folder)
            assert not launched.get('failures') and len(launched['tasks'])==1;tasks.append({'service':service,'arn':launched['tasks'][0]['taskArn']})
            (ROOT/'package-probe-tasks.json').write_text(json.dumps({'definitions':definitions,'tasks':tasks},indent=2)+'\n')
        print('Both application packages launched under their own ECS runtime identities.',flush=True)
        for _ in range(90):
            states=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',*[t['arn'] for t in tasks])['tasks']
            if all(t['lastStatus']=='STOPPED' for t in states):break
            time.sleep(5)
        else:raise RuntimeError('Secret delivery probe timeout')
        for item in tasks:
            state=next(t for t in states if t['taskArn']==item['arn']);assert next(c for c in state['containers'] if c['name']=='probe').get('exitCode')==0,'Secret probe failed; bounded logs require review'
            events=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','account-probe/probe/'+item['arn'].split('/')[-1],'--start-from-head')['events']
            records=[]
            for event in events:
                try:record=json.loads(event['message'])
                except ValueError:continue
                if record.get('stage')=='VERIFIED':records.append(record)
            assert len(records)==1 and records[0]['service']==item['service'] and records[0]['plaintextRemoved'] and records[0]['fixtureCleanup']
            results.append({'taskArn':item['arn'],**records[0]})
    finally:
        try:
            for item in tasks:
                state=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',item['arn'])['tasks'][0]
                if state['lastStatus']!='STOPPED':job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',item['arn'],'--reason','Bounded connection probe cleanup')
            if tasks:
                for _ in range(60):
                    remaining=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',*[t['arn'] for t in tasks])['tasks']
                    if all(t['lastStatus']=='STOPPED' for t in remaining):break
                    time.sleep(2)
                else:raise RuntimeError('Task stop requires reconciliation before further work')
        finally:
            if enabled:database_action('disable')
            for definition in definitions:job.aws('ecs','deregister-task-definition','--task-definition',definition)
    after=subprocess.run(state_command,capture_output=True);assert after.returncode==0,'Postflight source state audit failed'
    after=json.loads(after.stdout);(ROOT/'after-state.json').write_text(json.dumps(after,indent=2)+'\n')
    assert before==after,'Source rows changed; reconcile exact fixture data before acceptance'
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','images':images,'probes':results,'temporaryTaskDefinitionsDeregistered':True,'applicationsDeployed':False,'databaseLoginsEnabled':False,'productionCertificateProvisioned':False,'scope':'Synthetic managed account and private file flow in one isolated task; process restart only; no public ingress, real recipients or signing', 'fixturePrefix':fixture, 'driverSha256':{name:hashlib.sha256(value.encode()).hexdigest() for name,value in drivers.items()},'executedProbeSha256':hashlib.sha256(code.encode()).hexdigest(),'sourceSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'probe.mjs',ROOT/'role-control.mjs',ROOT/'state.mjs',ROOT/'verify.py']}}
    (ROOT/'package-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Cloud account/file flow passed and runtime login disabled after task cleanup.',flush=True)
if __name__=='__main__':main()
