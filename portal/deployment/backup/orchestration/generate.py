"""Generate a bounded native Step Functions workflow and disabled daily schedule."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
ACCOUNT='059393269249';PREFIX='growthcast-portal-staging';ARN='arn:aws:'
name=PREFIX+'-backup-workflow';lock=PREFIX+'-backup-lock'
state_arn=f'arn:aws:states:us-east-1:{ACCOUNT}:stateMachine:{name}'
cluster=f'arn:aws:ecs:us-east-1:{ACCOUNT}:cluster/{PREFIX}-backup'
backup=json.loads((ROOT.parent/'job/deployment-evidence.json').read_text())['taskDefinitionArn']
restore=json.loads((ROOT.parent/'restore-worker/deployment.json').read_text())['TaskDefinitionArn']
catch=[{'ErrorEquals':['States.ALL'],'ResultPath':'$.failure','Next':'RetainLockFailure'}]
states={
 'Acquire':{'Type':'Task','Resource':'arn:aws:states:::dynamodb:putItem','Parameters':{'TableName':lock,'Item':{'environment':{'S':'staging'},'owner':{'S.$':'$$.Execution.Id'},'startedAt':{'S.$':'$$.Execution.StartTime'}},'ConditionExpression':'attribute_not_exists(environment)'},'ResultPath':None,'Catch':[{'ErrorEquals':['States.ALL'],'Next':'LockUnavailable','ResultPath':None}],'Next':'Backup'},
 'LockUnavailable':{'Type':'Fail','Error':'BackupLockUnavailable','Cause':'Another run or a retained failure lock exists; no task was launched.'},
 'RetainLockFailure':{'Type':'Fail','Error':'BackupOrVerificationFailed','Cause':'Lock retained: inspect execution and ECS tasks before explicit recovery.'},
}
def run_task(definition,security,result,next_state):
 return {'Type':'Task','Resource':'arn:aws:states:::ecs:runTask.sync','TimeoutSeconds':1800,'Parameters':{'Cluster':cluster,'TaskDefinition':definition,'LaunchType':'FARGATE','PlatformVersion':'1.4.0','NetworkConfiguration':{'AwsvpcConfiguration':{'Subnets':['${Subnet}'],'SecurityGroups':[security],'AssignPublicIp':'ENABLED'}}},'ResultPath':result,'Catch':catch,'Next':next_state}
states['Backup']=run_task(backup,'${BackupSG}','$.backup','BackupSucceeded')
states['BackupSucceeded']={'Type':'Choice','Choices':[{'Variable':'$.backup.Containers[0].ExitCode','NumericEquals':0,'Next':'BackupLogStream'}],'Default':'RetainLockFailure'}
states['BackupLogStream']={'Type':'Pass','Parameters':{'stream.$':"States.Format('backup/backup/{}', States.ArrayGetItem(States.StringSplit($.backup.TaskArn, '/'), 2))"},'ResultPath':'$.log','Next':'BackupLogsWait1'}
# Bounded eventual-consistency wait; only the pinned job's exact three status lines are accepted.
for i in range(1,4):
 states[f'BackupLogsWait{i}']={'Type':'Wait','Seconds':20,'Next':f'BackupLogs{i}'}
 states[f'BackupLogs{i}']={'Type':'Task','Resource':'arn:aws:states:::aws-sdk:cloudwatchlogs:getLogEvents','Parameters':{'LogGroupName':'/growthcast/portal/staging/backup','LogStreamName.$':'$.log.stream','StartFromHead':True,'Limit':10},'ResultPath':'$.logs','Retry':[{'ErrorEquals':['CloudWatchLogs.ResourceNotFoundException'],'IntervalSeconds':10,'MaxAttempts':2}],'Catch':catch,'Next':f'BackupLogsReady{i}'}
 states[f'BackupLogsReady{i}']={'Type':'Choice','Choices':[{'And':[{'Variable':'$.logs.Events[2].Message','IsPresent':True},{'Not':{'Variable':'$.logs.Events[3]','IsPresent':True}}],'Next':'Receipt'}],'Default':f'BackupLogsWait{i+1}' if i<3 else 'RetainLockFailure'}
states['Receipt']={'Type':'Pass','Parameters':{'event.$':'States.StringToJson($.logs.Events[2].Message)'},'ResultPath':'$.receipt','Next':'ReceiptReady'}
states['ReceiptReady']={'Type':'Choice','Choices':[{'And':[{'Variable':'$.receipt.event.stage','StringEquals':'UPLOADED'},{'Variable':'$.receipt.event.receiptKey','IsString':True},{'Variable':'$.receipt.event.receiptVersion','IsString':True},{'Variable':'$.receipt.event.verification','StringEquals':'pending-independent-restore'}],'Next':'Restore'}],'Default':'RetainLockFailure'}
states['Restore']=run_task(restore,'${RestoreSG}','$.restore','RestoreSucceeded')
states['Restore']['Parameters']['Overrides']={'ContainerOverrides':[{'Name':'restore','Environment':[{'Name':'RECEIPT_KEY','Value.$':'$.receipt.event.receiptKey'},{'Name':'RECEIPT_VERSION','Value.$':'$.receipt.event.receiptVersion'}]}]}
states['RestoreSucceeded']={'Type':'Choice','Choices':[{'Variable':'$.restore.Containers[0].ExitCode','NumericEquals':0,'Next':'Release'}],'Default':'RetainLockFailure'}
states['Release']={'Type':'Task','Resource':'arn:aws:states:::dynamodb:deleteItem','Parameters':{'TableName':lock,'Key':{'environment':{'S':'staging'}},'ConditionExpression':'#owner = :owner','ExpressionAttributeNames':{'#owner':'owner'},'ExpressionAttributeValues':{':owner':{'S.$':'$$.Execution.Id'}}},'ResultPath':None,'Catch':catch,'Next':'Verified'}
states['Verified']={'Type':'Pass','Parameters':{'status':'VERIFIED','backupTask.$':'$.backup.TaskArn','restoreTask.$':'$.restore.TaskArn','receiptKey.$':'$.receipt.event.receiptKey','receiptVersion.$':'$.receipt.event.receiptVersion'},'End':True}
workflow={'Comment':'Daily staging capture followed by independent exact-receipt restore; failure retains single-run lock.','StartAt':'Acquire','TimeoutSeconds':3900,'States':states}
(ROOT/'workflow.json').write_text(json.dumps(workflow,indent=2)+'\n')
role=f'arn:aws:iam::{ACCOUNT}:role/'
resources={
 'Lock':{'Type':'AWS::DynamoDB::Table','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':{'TableName':lock,'BillingMode':'PAY_PER_REQUEST','AttributeDefinitions':[{'AttributeName':'environment','AttributeType':'S'}],'KeySchema':[{'AttributeName':'environment','KeyType':'HASH'}],'SSESpecification':{'SSEEnabled':True}}},
 'WorkflowRole':{'Type':'AWS::IAM::Role','Properties':{'RoleName':name,'AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'states.amazonaws.com'},'Action':'sts:AssumeRole','Condition':{'StringEquals':{'aws:SourceAccount':ACCOUNT},'ArnEquals':{'aws:SourceArn':state_arn}}}]},'Policies':[{'PolicyName':'PinnedTasksAndLock','PolicyDocument':{'Version':'2012-10-17','Statement':[
 {'Effect':'Allow','Action':['dynamodb:PutItem','dynamodb:DeleteItem'],'Resource':{'Fn::GetAtt':['Lock','Arn']}},
 {'Effect':'Allow','Action':'ecs:RunTask','Resource':[backup,restore],'Condition':{'ArnEquals':{'ecs:cluster':cluster}}},
 {'Effect':'Allow','Action':['ecs:DescribeTasks','ecs:StopTask'],'Resource':f'arn:aws:ecs:us-east-1:{ACCOUNT}:task/{PREFIX}-backup/*'},
 {'Effect':'Allow','Action':'iam:PassRole','Resource':[role+PREFIX+'-backup-task',role+PREFIX+'-restore-task',role+PREFIX+'-backup-execution'],'Condition':{'StringEquals':{'iam:PassedToService':'ecs-tasks.amazonaws.com'}}},
 {'Effect':'Allow','Action':['events:PutTargets','events:PutRule','events:DescribeRule'],'Resource':f'arn:aws:events:us-east-1:{ACCOUNT}:rule/StepFunctionsGetEventsForECSTaskRule'},
 {'Effect':'Allow','Action':'logs:GetLogEvents','Resource':f'arn:aws:logs:us-east-1:{ACCOUNT}:log-group:/growthcast/portal/staging/backup:log-stream:backup/backup/*'}]}}]}},
 'Workflow':{'Type':'AWS::StepFunctions::StateMachine','Properties':{'StateMachineName':name,'StateMachineType':'STANDARD','RoleArn':{'Fn::GetAtt':['WorkflowRole','Arn']},'DefinitionString':json.dumps(workflow),'DefinitionSubstitutions':{'Subnet':{'Ref':'Subnet'},'BackupSG':{'Ref':'BackupSG'},'RestoreSG':{'Ref':'RestoreSG'}}}},
 'ScheduleRole':{'Type':'AWS::IAM::Role','Properties':{'RoleName':PREFIX+'-backup-schedule','AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'events.amazonaws.com'},'Action':'sts:AssumeRole','Condition':{'StringEquals':{'aws:SourceAccount':ACCOUNT},'ArnEquals':{'aws:SourceArn':f'arn:aws:events:us-east-1:{ACCOUNT}:rule/{name}'}}}]},'Policies':[{'PolicyName':'OneWorkflow','PolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':'states:StartExecution','Resource':{'Ref':'Workflow'}}]}}]}},
 'Schedule':{'Type':'AWS::Events::Rule','Properties':{'Name':name,'ScheduleExpression':'cron(0 6 * * ? *)','State':{'Ref':'ScheduleState'},'Targets':[{'Id':'DailyBackupAndRestore','Arn':{'Ref':'Workflow'},'RoleArn':{'Fn::GetAtt':['ScheduleRole','Arn']},'Input':'{}','RetryPolicy':{'MaximumEventAgeInSeconds':3600,'MaximumRetryAttempts':0}}]}}
}
for metric in ['ExecutionsFailed','ExecutionsTimedOut','ExecutionsAborted']:
 resources[metric+'Alarm']={'Type':'AWS::CloudWatch::Alarm','Properties':{'AlarmName':PREFIX+'-'+metric,'Namespace':'AWS/States','MetricName':metric,'Dimensions':[{'Name':'StateMachineArn','Value':{'Ref':'Workflow'}}],'Statistic':'Sum','Period':60,'EvaluationPeriods':1,'Threshold':1,'ComparisonOperator':'GreaterThanOrEqualToThreshold','TreatMissingData':'notBreaching','AlarmActions':[f'arn:aws:sns:us-east-1:{ACCOUNT}:{PREFIX}-recovery-alerts']}}
resources['ScheduleFailureAlarm']={'Type':'AWS::CloudWatch::Alarm','Properties':{'AlarmName':PREFIX+'-BackupScheduleFailed','Namespace':'AWS/Events','MetricName':'FailedInvocations','Dimensions':[{'Name':'RuleName','Value':name}],'Statistic':'Sum','Period':60,'EvaluationPeriods':1,'Threshold':1,'ComparisonOperator':'GreaterThanOrEqualToThreshold','TreatMissingData':'notBreaching','AlarmActions':[f'arn:aws:sns:us-east-1:{ACCOUNT}:{PREFIX}-recovery-alerts']}}
template={'AWSTemplateFormatVersion':'2010-09-09','Description':'Daily bounded backup and independent restore workflow with exclusive lock.','Parameters':{'Subnet':{'Type':'AWS::EC2::Subnet::Id'},'BackupSG':{'Type':'AWS::EC2::SecurityGroup::Id'},'RestoreSG':{'Type':'AWS::EC2::SecurityGroup::Id'},'ScheduleState':{'Type':'String','Default':'DISABLED','AllowedValues':['DISABLED','ENABLED']}},'Resources':resources,'Outputs':{'StateMachineArn':{'Value':{'Ref':'Workflow'}},'ScheduleArn':{'Value':{'Fn::GetAtt':['Schedule','Arn']}},'LockTable':{'Value':{'Ref':'Lock'}}}}
(ROOT/'foundation.json').write_text(json.dumps(template,indent=2)+'\n')
