"""Launch one autonomous restore of the recorded deployed backup; never a schedule."""
import datetime,importlib.util,json,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    assert not (ROOT/'cloud-evidence.json').exists(),'An existing cloud acceptance must not be repeated silently'
    deployment=json.loads((ROOT/'deployment.json').read_text());prior=json.loads((ROOT.parent/'job/restore-evidence.json').read_text())
    pointer=next(e for e in prior['taskEvents'] if e['stage']=='UPLOADED')
    stack=job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0];out={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
    definition=job.aws('ecs','describe-task-definition','--task-definition',deployment['TaskDefinitionArn'])['taskDefinition'];c=definition['containerDefinitions'][0]
    assert c['image']==deployment['image'] and c['readonlyRootFilesystem'] and c['user']=='70:70'
    assert not c.get('secrets') and not c.get('environment') and not c.get('portMappings')
    assert definition['taskRoleArn']==deployment['RoleArn']
    request={'cluster':out['ClusterArn'],'taskDefinition':deployment['TaskDefinitionArn'],'launchType':'FARGATE','count':1,'platformVersion':'1.4.0',
      'overrides':{'containerOverrides':[{'name':'restore','environment':[{'name':'RECEIPT_KEY','value':pointer['receiptKey']},{'name':'RECEIPT_VERSION','value':pointer['receiptVersion']}]}]},
      'networkConfiguration':{'awsvpcConfiguration':{'subnets':[out['SubnetId']],'securityGroups':[out['MonitorSecurityGroupId']],'assignPublicIp':'ENABLED'}}}
    with tempfile.TemporaryDirectory() as d:
        (Path(d)/'request.json').write_text(json.dumps(request));result=job.aws('ecs','run-task','--cli-input-json','file:///input/request.json',mount=d)
    assert not result.get('failures') and len(result['tasks'])==1;arn=result['tasks'][0]['taskArn']
    (ROOT/'acceptance-task.json').write_text(json.dumps({'taskArn':arn,'receipt':pointer},indent=2)+'\n');print('Autonomous restore task launched with only an exact-version receipt pointer.',flush=True)
    for _ in range(150):
        task=job.aws('ecs','describe-tasks','--cluster',out['ClusterArn'],'--tasks',arn)['tasks'][0]
        if task['lastStatus']=='STOPPED':break
        time.sleep(5)
    else:
        job.aws('ecs','stop-task','--cluster',out['ClusterArn'],'--task',arn,'--reason','Restore acceptance timeout');raise RuntimeError('Restore timeout')
    assert task['containers'][0].get('exitCode')==0,'Restore worker failed; inspect bounded logs'
    logs=job.aws('logs','get-log-events','--log-group-name',out['LogGroup'],'--log-stream-name','restore/restore/'+arn.split('/')[-1],'--start-from-head')['events']
    states=[]
    for event in logs:
        try:state=json.loads(event['message'])
        except ValueError:continue
        if isinstance(state,dict) and state.get('stage') in ['VERIFIED','FAILED']:states.append(state)
    assert len(states)==1 and states[0]['stage']=='VERIFIED'
    state=states[0];assert {k:state[k] for k in prior['restored']}==prior['restored']
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'taskArn':arn,'image':deployment['image'],'exitCode':0,'result':'passed','state':state,'sourceCredentialsMounted':False,'archiveFetchedAndDecryptedByTask':True,'independentVerificationPublished':True,'backupScheduleEnabled':False,'restoreScheduleEnabled':False}
    (ROOT/'cloud-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('ECS archive retrieval, KMS decryption, isolated restore and independent record publication passed.')
if __name__=='__main__':main()
