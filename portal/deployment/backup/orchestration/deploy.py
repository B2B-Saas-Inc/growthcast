"""Deploy reviewed orchestration disabled; enable only after successful end-to-end evidence."""
import argparse,datetime,importlib.util,json,tempfile,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
STACK='growthcast-portal-staging-backup-orchestration'
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--enable',action='store_true');args=parser.parse_args()
    if args.enable:
        proof=json.loads((ROOT/'acceptance.json').read_text());assert proof['status']=='SUCCEEDED' and proof['lockReleased'] and proof['independentVerificationPublished']
        scheduled=json.loads((ROOT/'schedule-acceptance.json').read_text());assert scheduled['status']=='SUCCEEDED' and scheduled['temporaryMinuteScheduleRestored'] and scheduled['successfulSchedulerInvocations']
        assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['checkedAt'])).total_seconds()<3600
    assert job.aws('sts','get-caller-identity')['Account']=='059393269249'
    outputs={x['OutputKey']:x['OutputValue'] for x in job.aws('cloudformation','describe-stacks','--stack-name',job.STACK)['Stacks'][0]['Outputs']}
    params={'Subnet':outputs['SubnetId'],'BackupSG':outputs['SecurityGroupId'],'RestoreSG':outputs['MonitorSecurityGroupId'],'ScheduleState':'ENABLED' if args.enable else 'DISABLED'}
    template=json.loads((ROOT/'foundation.json').read_text());definition=template['Resources']['Workflow']['Properties']['DefinitionString']
    for key,value in params.items():definition=definition.replace('${'+key+'}',value)
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);(p/'definition.json').write_text(definition)
        validated=job.aws('stepfunctions','validate-state-machine-definition','--definition','file:///input/definition.json','--type','STANDARD',mount=p);(ROOT/'definition-validation.json').write_text(json.dumps(validated,indent=2)+'\n');assert validated['result']=='OK'
    existing=any(s['StackName']==STACK for s in job.aws('cloudformation','list-stacks','--stack-status-filter','CREATE_COMPLETE','UPDATE_COMPLETE')['StackSummaries'])
    change='orchestration-'+str(uuid.uuid4())
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);request={'StackName':STACK,'ChangeSetName':change,'ChangeSetType':'UPDATE' if existing else 'CREATE','Capabilities':['CAPABILITY_NAMED_IAM'],'TemplateBody':json.dumps(template),'Parameters':[{'ParameterKey':k,'ParameterValue':v} for k,v in params.items()]};(p/'request.json').write_text(json.dumps(request));job.aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=p)
    for _ in range(60):
        plan=job.aws('cloudformation','describe-change-set','--stack-name',STACK,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        if plan['Status']=='FAILED':raise RuntimeError('Orchestration change set failed')
        time.sleep(3)
    else:raise RuntimeError('Change set timeout')
    changes=[x['ResourceChange'] for x in plan['Changes']]
    if existing:assert args.enable and all(x['LogicalResourceId']=='Schedule' and x['Action']=='Modify' and x['Replacement']=='False' for x in changes)
    else:assert all(x['Action']=='Add' and x['LogicalResourceId'] in template['Resources'] for x in changes)
    (ROOT/('enable-changes.json' if args.enable else 'changes.json')).write_text(json.dumps(changes,indent=2)+'\n');job.aws('cloudformation','execute-change-set','--stack-name',STACK,'--change-set-name',change)
    for _ in range(120):
        stack=job.aws('cloudformation','describe-stacks','--stack-name',STACK)['Stacks'][0]
        if stack['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE']:break
        if 'ROLLBACK' in stack['StackStatus'] or 'FAILED' in stack['StackStatus']:raise RuntimeError('Orchestration deployment failed')
        time.sleep(5)
    else:raise RuntimeError('Deployment timeout')
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stack':STACK,'scheduleEnabled':args.enable,'schedule':'cron(0 6 * * ? *)',**{x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}}
    (ROOT/'deployment.json').write_text(json.dumps(record,indent=2)+'\n');print('Backup/restore workflow deployed; daily schedule '+('enabled.' if args.enable else 'disabled for acceptance.'))
if __name__=='__main__':main()
