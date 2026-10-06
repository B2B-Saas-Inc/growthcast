"""Read-only cloud permission and ECS failure-routing acceptance."""
import importlib.util
import json
from pathlib import Path
import tempfile
import datetime
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)

def main():
    bucket='arn:aws:s3:::growthcast-portal-staging-recovery-059393269249'
    cases=[('backup-task','s3:PutObject',bucket+'/verification/staging/probe.json','implicitDeny'),
        ('backup','s3:PutObject',bucket+'/verification/staging/probe.json','implicitDeny'),
        ('restore','s3:PutObject',bucket+'/verification/staging/probe.json','allowed'),
        ('restore','s3:PutObject',bucket+'/staging/probe/backup.gcb','implicitDeny'),
        ('recovery-monitor','s3:GetObject',bucket+'/verification/staging/probe.json','allowed'),
        ('recovery-monitor','s3:GetObject',bucket+'/staging/probe/backup.gcb','implicitDeny'),
        ('recovery-monitor','s3:PutObject',bucket+'/verification/staging/probe.json','implicitDeny'),
        ('recovery-monitor','secretsmanager:GetSecretValue','*','implicitDeny'),
        ('recovery-monitor','kms:Decrypt','*','implicitDeny')]
    results=[]
    for role,action,resource,expected in cases:
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn','arn:aws:iam::059393269249:role/growthcast-portal-staging-'+role,'--action-names',action,'--resource-arns',resource)['EvaluationResults'][0]['EvalDecision']
        assert actual==expected
        results.append({'role':role,'action':action,'decision':actual})
    for prefix,expected in [('verification/staging/','allowed'),('staging/','implicitDeny'),('','implicitDeny')]:
        context=[{'ContextKeyName':'s3:prefix','ContextKeyValues':[prefix],'ContextKeyType':'string'}]
        actual=job.aws('iam','simulate-principal-policy','--policy-source-arn','arn:aws:iam::059393269249:role/growthcast-portal-staging-recovery-monitor','--action-names','s3:ListBucket','--resource-arns',bucket,'--context-entries',json.dumps(context))['EvaluationResults'][0]['EvalDecision']
        assert actual==expected
        results.append({'action':'s3:ListBucket','prefix':prefix,'decision':actual})
    pattern=json.loads((ROOT.parent.parent/'offhost/foundation.json').read_text())['Resources']['BackupStoppedRule']['Properties']['EventPattern']
    event={'version':'0','id':'00000000-0000-4000-8000-000000000000','source':'aws.ecs','detail-type':'ECS Task State Change','account':'059393269249','time':'2026-09-24T00:00:00Z','region':'us-east-1','resources':[],
        'detail':{'clusterArn':'arn:aws:ecs:us-east-1:059393269249:cluster/growthcast-portal-staging-backup','taskDefinitionArn':'arn:aws:ecs:us-east-1:059393269249:task-definition/growthcast-portal-staging-backup:1','lastStatus':'STOPPED'}}
    with tempfile.TemporaryDirectory(prefix='growthcast-event-pattern-') as directory:
        p=Path(directory);(p/'pattern.json').write_text(json.dumps(pattern))
        pattern_cases=0
        for family in ['backup','restore','backup-monitor']:
            event['detail']['taskDefinitionArn']='arn:aws:ecs:us-east-1:059393269249:task-definition/growthcast-portal-staging-'+family+':1'
            for code,exit_code,match in [('EssentialContainerExited',0,False),('EssentialContainerExited',1,True),('TaskFailedToStart',None,True)]:
                event['detail'].update(stopCode=code,containers=[{'exitCode':exit_code}] if exit_code is not None else [{}]);(p/'event.json').write_text(json.dumps(event))
                result=job.aws('events','test-event-pattern','--event-pattern','file:///input/pattern.json','--event','file:///input/event.json',mount=p)['Result'];assert result is (match and family!='backup-monitor')
                pattern_cases+=1
    (ROOT/'policy-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'permissionCases':results,'ecsFailurePatterns':pattern_cases,'result':'passed'},indent=2)+'\n')
    print('Independent record-writer/monitor boundaries and pre-start/nonzero/success task routing passed.')

if __name__=='__main__':main()
