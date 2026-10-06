"""Actual Fargate materialization and negative probes under four separate task roles."""
import datetime,hashlib,importlib.util,json,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
IMAGE='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup@sha256:8afd648a6d577f41479ba92da1a88dbd525e04a2b759d091e5a5b5638991d4a3'
def main():
    assert not (ROOT/'evidence.json').exists(),'Review existing acceptance before rerunning'
    deployment=json.loads((ROOT/'deployment.json').read_text());resources=deployment['resources']
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0];out={i['OutputKey']:i['OutputValue'] for i in stack['Outputs']}
    code=(ROOT/'material.mjs').read_text()+'\n'+(ROOT/'probe.mjs').read_text().replace("import {materialize} from './material.mjs';\n",'')
    canaries={}
    with tempfile.TemporaryDirectory() as d:
        folder=Path(d);(folder/'canary').write_bytes(b'non-secret-runtime-boundary-probe')
        for app in ['atrium','documenso']:
            wrapped=job.aws('kms','encrypt','--key-id',resources[app.title()+'KeyArn'],'--plaintext','fileb:///input/canary','--encryption-context',json.dumps({'SecretARN':resources[app.title()+'SecretArn']}),mount=folder)
            canaries[app]=wrapped['CiphertextBlob']
    definitions=[];tasks=[];results=[]
    try:
        for service in ['atrium','documenso','backup','restore']:
            role=resources[service.title()+'RoleArn'] if service in ['atrium','documenso'] else 'arn:aws:iam::059393269249:role/growthcast-portal-staging-'+service+'-task'
            env={'SERVICE':service,'KEY_CANARIES':json.dumps(canaries),'SECRET_ARNS':json.dumps({app:resources[app.title()+'SecretArn'] for app in ['atrium','documenso']}),'KEY_ARNS':json.dumps({app:resources[app.title()+'KeyArn'] for app in ['atrium','documenso']}),'BACKUP_SECRET_ARN':json.loads((ROOT.parent/'backup/secret-evidence.json').read_text())['secretArn']}
            if service in deployment['versions']:env['SECRET_VERSION']=deployment['versions'][service]
            definition={'family':'growthcast-portal-staging-secret-probe','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'256','memory':'512','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'taskRoleArn':role,'executionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-execution','volumes':[{'name':'work'}],'containerDefinitions':[{'name':'probe','image':IMAGE,'essential':True,'user':'10001:10001','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['node'],'command':['--input-type=module','-e',code],'environment':[{'name':k,'value':v} for k,v in env.items()],'mountPoints':[{'sourceVolume':'work','containerPath':'/work','readOnly':False}],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':out['LogGroup'],'awslogs-region':'us-east-1','awslogs-stream-prefix':'secret-probe'}}}]}
            with tempfile.TemporaryDirectory() as d:
                folder=Path(d);(folder/'request.json').write_text(json.dumps(definition));taskdef=job.aws('ecs','register-task-definition','--cli-input-json','file:///input/request.json',mount=folder)['taskDefinition']['taskDefinitionArn'];definitions.append(taskdef)
                request={'cluster':out['ClusterArn'],'taskDefinition':taskdef,'launchType':'FARGATE','count':1,'platformVersion':'1.4.0','networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['MonitorSecurityGroupId']],'assignPublicIp':'ENABLED'}}};(folder/'request.json').write_text(json.dumps(request));launched=job.aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=folder)
            assert not launched.get('failures') and len(launched['tasks'])==1;tasks.append({'service':service,'arn':launched['tasks'][0]['taskArn']})
            (ROOT/'probe-tasks.json').write_text(json.dumps({'definitions':definitions,'tasks':tasks},indent=2)+'\n')
        print('Four isolated ECS probes launched with separate runtime/backup/restore identities.',flush=True)
        for _ in range(90):
            states=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',*[t['arn'] for t in tasks])['tasks']
            if all(t['lastStatus']=='STOPPED' for t in states):break
            time.sleep(5)
        else:raise RuntimeError('Secret delivery probe timeout')
        for item in tasks:
            state=next(t for t in states if t['taskArn']==item['arn']);assert state['containers'][0].get('exitCode')==0,'Secret probe failed; bounded logs require review'
            events=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','secret-probe/probe/'+item['arn'].split('/')[-1],'--start-from-head')['events']
            records=[]
            for event in events:
                try:record=json.loads(event['message'])
                except ValueError:continue
                if record.get('stage')=='VERIFIED':records.append(record)
            assert len(records)==1 and records[0]['service']==item['service'] and records[0]['denied']==4
            results.append({'taskArn':item['arn'],**records[0]})
    finally:
        for item in tasks:
            state=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',item['arn'])['tasks'][0]
            if state['lastStatus']!='STOPPED':job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',item['arn'],'--reason','Bounded secret probe cleanup')
        for definition in definitions:job.aws('ecs','deregister-task-definition','--task-definition',definition)
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','image':IMAGE,'probes':results,'temporaryTaskDefinitionsDeregistered':True,'applicationsDeployed':False,'databaseLoginsEnabled':False,'productionCertificateProvisioned':False,'validNonSecretKmsCanaries':True,'executedProbeSha256':hashlib.sha256(code.encode()).hexdigest(),'sourceSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'foundation.json',ROOT/'material.mjs',ROOT/'probe.mjs',ROOT/'verify.py']}}
    (ROOT/'evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Both own-secret deliveries and all 16 cross-service, recovery and mutation denials passed.',flush=True)
if __name__=='__main__':main()
