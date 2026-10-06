"""Actual backup and restore task roles must not read application connections."""
import datetime,importlib.util,json,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
IMAGE='059393269249.dkr.ecr.us-east-1.amazonaws.com/growthcast-portal-staging-backup@sha256:8afd648a6d577f41479ba92da1a88dbd525e04a2b759d091e5a5b5638991d4a3'
CODE="""import assert from 'node:assert/strict';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
const client=new SecretsManagerClient({region:'us-east-1',maxAttempts:1});
try{for(const arn of JSON.parse(process.env.CONNECTION_ARNS))await assert.rejects(client.send(new GetSecretValueCommand({SecretId:arn})),e=>e.name==='AccessDeniedException');console.log(JSON.stringify({stage:'VERIFIED',role:process.env.PROBE_ROLE,denied:2}));}catch{console.error('Connection access boundary failed');process.exitCode=1;}finally{client.destroy();}
"""
def main():
    assert not (ROOT/'recovery-denial-evidence.json').exists(),'Existing acceptance needs review'
    pins=json.loads((ROOT/'pins.json').read_text());assert len(pins)==2
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0];out={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    tasks=[];definitions=[];results=[]
    try:
        for role in ['backup','restore']:
            definition={'family':'growthcast-portal-staging-connection-denial','networkMode':'awsvpc','requiresCompatibilities':['FARGATE'],'cpu':'256','memory':'512','runtimePlatform':{'cpuArchitecture':'ARM64','operatingSystemFamily':'LINUX'},'taskRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-'+role+'-task','executionRoleArn':'arn:aws:iam::059393269249:role/growthcast-portal-staging-backup-execution','containerDefinitions':[{'name':'probe','image':IMAGE,'essential':True,'user':'10001:10001','readonlyRootFilesystem':True,'linuxParameters':{'capabilities':{'drop':['ALL']}},'entryPoint':['node'],'command':['--input-type=module','-e',CODE],'environment':[{'name':'CONNECTION_ARNS','value':json.dumps([v['arn'] for v in pins.values()])},{'name':'PROBE_ROLE','value':role}],'logConfiguration':{'logDriver':'awslogs','options':{'awslogs-group':out['LogGroup'],'awslogs-region':'us-east-1','awslogs-stream-prefix':'connection-denial'}}}]}
            with tempfile.TemporaryDirectory() as d:
                folder=Path(d);(folder/'request.json').write_text(json.dumps(definition));taskdef=job.aws('ecs','register-task-definition','--cli-input-json','file:///input/request.json',mount=folder)['taskDefinition']['taskDefinitionArn'];definitions.append(taskdef)
                request={'cluster':out['ClusterArn'],'taskDefinition':taskdef,'launchType':'FARGATE','count':1,'platformVersion':'1.4.0','networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['MonitorSecurityGroupId']],'assignPublicIp':'ENABLED'}}};(folder/'request.json').write_text(json.dumps(request));launched=job.aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=folder)
            assert not launched.get('failures') and len(launched['tasks'])==1;tasks.append({'role':role,'arn':launched['tasks'][0]['taskArn']})
            (ROOT/'recovery-denial-tasks.json').write_text(json.dumps({'definitions':definitions,'tasks':tasks},indent=2)+'\n')
        print('Backup and restore task-role denial probes launched.',flush=True)
        for _ in range(90):
            states=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',*[t['arn'] for t in tasks])['tasks']
            if all(t['lastStatus']=='STOPPED' for t in states):break
            time.sleep(5)
        else:raise RuntimeError('Denial probe timeout')
        for item in tasks:
            state=next(t for t in states if t['taskArn']==item['arn']);assert state['containers'][0].get('exitCode')==0,'Connection denial failed'
            events=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','connection-denial/probe/'+item['arn'].split('/')[-1],'--start-from-head')['events']
            records=[json.loads(e['message']) for e in events if e['message'].startswith('{')];assert len(records)==1 and records[0]=={'stage':'VERIFIED','role':item['role'],'denied':2}
            results.append({**records[0],'taskArn':item['arn']})
    finally:
        for item in tasks:
            state=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',item['arn'])['tasks'][0]
            if state['lastStatus']!='STOPPED':job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',item['arn'],'--reason','Connection denial cleanup')
        for arn in definitions:job.aws('ecs','deregister-task-definition','--task-definition',arn)
    (ROOT/'recovery-denial-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','probes':results,'temporaryDefinitionsInactive':True},indent=2)+'\n')
    print('All four actual backup/restore connection-secret read denials passed.',flush=True)
if __name__=='__main__':main()
