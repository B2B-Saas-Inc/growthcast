"""Apply the reviewed verification/monitor/notification foundation, no backup schedule."""
import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import uuid
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--enable-notifications',action='store_true');args=parser.parse_args()
    if args.enable_notifications:
        deployed=json.loads((ROOT/'provisioning-evidence.json').read_text())
        subs=job.aws('sns','list-subscriptions-by-topic','--topic-arn',deployed['topicArn'])['Subscriptions']
        assert any(x['Protocol']=='email' and x['Endpoint']=='ewhite@growthcast.app' and x['SubscriptionArn']!='PendingConfirmation' for x in subs),'Email confirmation required'
        monitor=json.loads((ROOT/'cloud-monitor-evidence.json').read_text());assert monitor['state']['healthy'] is True
        assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(monitor['checkedAt'])).total_seconds()<3600,'Fresh monitor acceptance required'
    assert job.aws('sts','get-caller-identity')['Account']=='059393269249'
    stack='growthcast-portal-staging-recovery';change='verification-'+str(uuid.uuid4())
    request={'StackName':stack,'ChangeSetName':change,'ChangeSetType':'UPDATE','Capabilities':['CAPABILITY_NAMED_IAM'],
        'TemplateBody':(ROOT.parent.parent/'offhost/foundation.json').read_text(),
        'Parameters':[{'ParameterKey':'AlertEmail','ParameterValue':'ewhite@growthcast.app'},{'ParameterKey':'EnableNotifications','ParameterValue':'true' if args.enable_notifications else 'false'}]}
    with tempfile.TemporaryDirectory(prefix='growthcast-verification-plan-') as directory:
        (Path(directory)/'request.json').write_text(json.dumps(request))
        job.aws('cloudformation','create-change-set','--cli-input-json','file:///input/request.json',mount=directory)
    for _ in range(60):
        plan=job.aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',change)
        if plan['Status']=='CREATE_COMPLETE':break
        if plan['Status']=='FAILED':raise RuntimeError('Verification change set failed')
        time.sleep(3)
    else:raise RuntimeError('Change set timeout')
    previous=job.aws('cloudformation','get-template','--stack-name',stack)['TemplateBody']
    if isinstance(previous,str):previous=json.loads(previous)
    reviewed=json.loads(request['TemplateBody'])
    assert previous['Resources']['UploadRole']==reviewed['Resources']['UploadRole'],'Uploader must remain unchanged'
    allowed={'BackupStoppedRule','UploadRole','RestoreRole','ArchiveBucket','SessionBroker','MonitorRole','BackupFailedAlarm','RecoveryUnhealthyAlarm','MonitorMissingAlarm','AlertTopic','AlertTopicPolicy','AlertSubscription'}
    changes=[x['ResourceChange'] for x in plan['Changes']]
    assert all(c['LogicalResourceId'] in allowed and c['Action'] in ['Add','Modify'] and (c['Action']=='Add' or c.get('Replacement')=='False') for c in changes)
    (ROOT/'changes.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'changes':changes},indent=2)+'\n')
    job.aws('cloudformation','execute-change-set','--stack-name',stack,'--change-set-name',change)
    for _ in range(120):
        state=job.aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0]
        if state['StackStatus']=='UPDATE_COMPLETE':break
        if 'ROLLBACK' in state['StackStatus'] or 'FAILED' in state['StackStatus']:raise RuntimeError('Verification stack update failed')
        time.sleep(5)
    else:raise RuntimeError('Stack update timeout')
    outputs={x['OutputKey']:x['OutputValue'] for x in state['Outputs']}
    backup_scheduled=False
    if (ROOT.parent/'orchestration/deployment.json').exists():
        backup_scheduled=job.aws('events','describe-rule','--name','growthcast-portal-staging-backup-workflow')['State']=='ENABLED'
    evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stackStatus':state['StackStatus'],'monitorRoleArn':outputs['MonitorRoleArn'],'topicArn':outputs['AlertTopicArn'],'notificationsEnabled':args.enable_notifications,'backupScheduleEnabled':backup_scheduled}
    (ROOT/'provisioning-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print('Verification/monitoring foundation updated; notifications '+('enabled for confirmed recipient.' if args.enable_notifications else 'disabled pending recipient confirmation.'))

if __name__=='__main__':main()
