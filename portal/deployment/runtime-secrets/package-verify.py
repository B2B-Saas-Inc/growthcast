"""Actual Fargate materialization and negative probes under four separate task roles."""
import datetime,hashlib,importlib.util,json,tempfile,time,subprocess,os,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
IMAGE='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup@sha256:8afd648a6d577f41479ba92da1a88dbd525e04a2b759d091e5a5b5638991d4a3'
def main():
    assert not (ROOT/'package-evidence.json').exists(),'Review existing acceptance before rerunning'
    deployment=json.loads((ROOT/'deployment.json').read_text());resources=deployment['resources']
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0];out={i['OutputKey']:i['OutputValue'] for i in stack['Outputs']}
    code=(ROOT/'package-probe.mjs').read_text().replace("from './deliver.mjs'", "from '/boundary/deployment/runtime-secrets/deliver.mjs'").replace("from '../runtime/", "from '/boundary/deployment/runtime/")
    images={}
    repo=out['RepositoryUri']
    assert repo=='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup'
    with tempfile.TemporaryDirectory() as d:
        env={**os.environ,'DOCKER_CONFIG':d}
        password=job.command(['ecr','get-login-password'])
        result=subprocess.run(['docker','login',repo.split('/')[0],'--username','AWS','--password-stdin'],input=password,capture_output=True,env=env)
        assert result.returncode==0,'Registry login failed'
        for service in ['atrium','documenso']:
            tag='runtime-'+service+'-'+uuid.uuid4().hex[:12]
            for args in [['tag','growthcast-'+service+'-runtime',repo+':'+tag],['push',repo+':'+tag]]:
                result=subprocess.run(['docker',*args],capture_output=True,env=env)
                assert result.returncode==0,'Runtime image publication failed'
            digest=job.aws('ecr','describe-images','--repository-name','growthcast-portal-staging-backup','--image-ids','imageTag='+tag)['imageDetails'][0]['imageDigest']
            images[service]=repo+'@'+digest
            print('Published digest-pinned '+service+' application package.',flush=True)
    (ROOT/'package-images.json').write_text(json.dumps(images,indent=2)+'\n')
    definitions=[];tasks=[];results=[]
    try:
        for service in ['atrium','documenso']:
            role=resources[service.title()+'RoleArn']
            env={'GC_SERVICE':service}
            definition={'family':'growthcast-portal-staging-package-secret-probe','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'512','memory':'1024','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'taskRoleArn':role,'executionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-execution','volumes':[{'name':'delivered'},{'name':'origin'}],'containerDefinitions':[{'name':'probe','image':images[service],'essential':True,'user':'1000:1000' if service=='atrium' else '1001:65533','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['/usr/local/bin/bun' if service=='atrium' else '/usr/local/bin/node'],'command':['--input-type=module','-e',code],'environment':[{'name':k,'value':v} for k,v in env.items()],'mountPoints':[{'sourceVolume':'delivered','containerPath':'/run/delivered','readOnly':False},{'sourceVolume':'origin','containerPath':'/run/origin','readOnly':False}],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':out['LogGroup'],'awslogs-region':'us-east-1','awslogs-stream-prefix':'package-secret-probe'}}}]}
            with tempfile.TemporaryDirectory() as d:
                folder=Path(d);(folder/'request.json').write_text(json.dumps(definition));taskdef=job.aws('ecs','register-task-definition','--cli-input-json','file:///input/request.json',mount=folder)['taskDefinition']['taskDefinitionArn'];definitions.append(taskdef)
                request={'cluster':out['ClusterArn'],'taskDefinition':taskdef,'launchType':'FARGATE','count':1,'platformVersion':'1.4.0','networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['MonitorSecurityGroupId']],'assignPublicIp':'ENABLED'}}};(folder/'request.json').write_text(json.dumps(request));launched=job.aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=folder)
            assert not launched.get('failures') and len(launched['tasks'])==1;tasks.append({'service':service,'arn':launched['tasks'][0]['taskArn']})
            (ROOT/'package-probe-tasks.json').write_text(json.dumps({'definitions':definitions,'tasks':tasks},indent=2)+'\n')
        print('Both application packages launched under their own ECS runtime identities.',flush=True)
        for _ in range(90):
            states=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',*[t['arn'] for t in tasks])['tasks']
            if all(t['lastStatus']=='STOPPED' for t in states):break
            time.sleep(5)
        else:raise RuntimeError('Secret delivery probe timeout')
        for item in tasks:
            state=next(t for t in states if t['taskArn']==item['arn']);assert state['containers'][0].get('exitCode')==0,'Secret probe failed; bounded logs require review'
            events=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','package-secret-probe/probe/'+item['arn'].split('/')[-1],'--start-from-head')['events']
            records=[]
            for event in events:
                try:record=json.loads(event['message'])
                except ValueError:continue
                if record.get('stage')=='VERIFIED':records.append(record)
            assert len(records)==1 and records[0]['service']==item['service'] and records[0]['plaintextRemoved'] and records[0]['privateFileConsumption']
            results.append({'taskArn':item['arn'],**records[0]})
    finally:
        for item in tasks:
            state=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',item['arn'])['tasks'][0]
            if state['lastStatus']!='STOPPED':job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',item['arn'],'--reason','Bounded secret probe cleanup')
        for definition in definitions:job.aws('ecs','deregister-task-definition','--task-definition',definition)
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','images':images,'probes':results,'temporaryTaskDefinitionsDeregistered':True,'applicationsDeployed':False,'databaseLoginsEnabled':False,'productionCertificateProvisioned':False,'scope':'Live cloud delivery and private-file consumption inside actual application images; application servers not launched','executedProbeSha256':hashlib.sha256(code.encode()).hexdigest(),'sourceSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'deliver.mjs',ROOT/'material.mjs',ROOT/'runtime-pins.json',ROOT/'package-probe.mjs',ROOT/'package-verify.py']}}
    (ROOT/'package-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Both actual application images passed live task-role delivery, private-file consumption and cleanup.',flush=True)
if __name__=='__main__':main()
