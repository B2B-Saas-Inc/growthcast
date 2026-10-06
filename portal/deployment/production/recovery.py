"""Independent production backup/restore workflow, exclusive lock and operator alarms."""
from common import *
f=load(R/'foundation-resources.json');images=load(R/'images.json');api=load(R/'api-resources.json')
P='growthcast-portal-production';stage='growthcast-portal-staging';ACCOUNT='059393269249'
resources=aws('cloudformation','list-stack-resources','--stack-name',P+'-api')['StackResourceSummaries'];network={x['LogicalResourceId']:x['PhysicalResourceId'] for x in resources}
# Dedicated task definitions use the tested capture/restore implementations with production-only identities.
tasks=load(R/'recovery-tasks.json') if (R/'recovery-tasks.json').exists() else {}
for kind,family,role in [('backup',stage+'-backup','BackupRoleArn'),('restore',stage+'-restore','RestoreRoleArn'),('monitor',stage+'-backup-monitor',None)]:
 if kind in tasks or kind=='monitor':continue
 original=aws('ecs','describe-task-definition','--task-definition',family)['taskDefinition']
 td={k:v for k,v in original.items() if k in ['family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','placementConstraints','requiresCompatibilities','cpu','memory','runtimePlatform','ephemeralStorage']}
 td['family']=family.replace(stage,P);td['taskRoleArn']=f[role];td['executionRoleArn']=f['ExecutionRoleArn']
 c=td['containerDefinitions'][0];c['image']=images[kind];c['logConfiguration']['options']['awslogs-group']=f['LogGroup']
 save(R/(kind+'-task.json'),td)
 created=aws_request(['ecs','register-task-definition'],td);tasks[kind]=created['taskDefinition']['taskDefinitionArn'];save(R/'recovery-tasks.json',tasks)
 print('Production '+kind+' task registered.',flush=True)
# Reuse reviewed workflow state transitions and conditional owner-based lock release.
t=load(D/'backup/orchestration/foundation.json')
text=json.dumps(t).replace(stage,P).replace('/growthcast/portal/staging/backup',f['LogGroup']).replace('"staging"','"production"')
t=json.loads(text);t.pop('Parameters');r=t['Resources']
workflow=json.loads(r['Workflow']['Properties']['DefinitionString'].replace('staging','production'))
for state in workflow['States'].values():
 if state.get('Type')=='Task' and state.get('Resource')=='arn:aws:states:::ecs:runTask.sync':
  state['Parameters']['Cluster']=api['ClusterArn'];kind='restore' if state.get('Next')=='RestoreSucceeded' else 'backup';state['Parameters']['TaskDefinition']=tasks[kind]
  state['Parameters']['NetworkConfiguration']['AwsvpcConfiguration'].update(Subnets=[network['Subnet0']],SecurityGroups=[{'Ref':kind.title()+'SecurityGroup'}])
  state['TimeoutSeconds']=1200
# Resolve security-group references via DefinitionSubstitutions, keeping JSON values valid strings.
for state in workflow['States'].values():
 if state.get('Resource')=='arn:aws:states:::ecs:runTask.sync':
  kind='restore' if state.get('Next')=='RestoreSucceeded' else 'backup';state['Parameters']['NetworkConfiguration']['AwsvpcConfiguration']['SecurityGroups']=['${'+kind.title()+'SG}']
workflow['TimeoutSeconds']=2700
r['Workflow']['Properties']['DefinitionString']=json.dumps(workflow)
r['Workflow']['Properties']['DefinitionSubstitutions']={k+'SG':{'Ref':k+'SecurityGroup'} for k in ['Backup','Restore']}
for name,ports in [('Backup',[443,5432]),('Restore',[443])]:
 r[name+'SecurityGroup']={'Type':'AWS::EC2::SecurityGroup','Properties':{'GroupDescription':'Production '+name+' outbound TLS only','VpcId':network['Vpc'],'SecurityGroupEgress':[{'IpProtocol':'tcp','FromPort':p,'ToPort':p,'CidrIp':'0.0.0.0/0'} for p in ports]}}
statements=r['WorkflowRole']['Properties']['Policies'][0]['PolicyDocument']['Statement']
for st in statements:
 actions=st['Action'] if isinstance(st['Action'],list) else [st['Action']]
 if 'ecs:RunTask' in actions:st['Resource']=[tasks['backup'],tasks['restore']];st['Condition']={'ArnEquals':{'ecs:cluster':api['ClusterArn']}}
 if 'ecs:DescribeTasks' in actions:st['Resource']='arn:aws:ecs:us-east-1:'+ACCOUNT+':task/'+P+'-api/*'
 if 'iam:PassRole' in actions:st['Resource']=[f[k] for k in ['BackupRoleArn','RestoreRoleArn','ExecutionRoleArn']]
 if 'logs:GetLogEvents' in actions:st['Resource']='arn:aws:logs:us-east-1:'+ACCOUNT+':log-group:'+f['LogGroup']+':log-stream:backup/backup/*'
r['Schedule']['Properties']['State']='DISABLED';r['Schedule']['Properties']['ScheduleExpression']='rate(30 minutes)';r['Schedule']['Properties']['Targets'][0]['Id']='ProductionBackupAndRestore'
# Reuse the operator's confirmed email topic; no new subscription or unsolicited message.
topic='arn:aws:sns:us-east-1:'+ACCOUNT+':growthcast-portal-staging-recovery-alerts'
for resource in r.values():
 if resource['Type']=='AWS::CloudWatch::Alarm':resource['Properties']['AlarmActions']=[topic]
# Missing successful workflow completions covers failed tasks, held locks and a disabled/broken schedule.
r['FreshnessAlarm']={'Type':'AWS::CloudWatch::Alarm','Properties':{'AlarmName':P+'-RecoveryVerificationMissing','Namespace':'AWS/States','MetricName':'ExecutionsSucceeded','Dimensions':[{'Name':'StateMachineArn','Value':{'Ref':'Workflow'}}],'Statistic':'Sum','Period':1800,'EvaluationPeriods':2,'DatapointsToAlarm':2,'Threshold':1,'ComparisonOperator':'LessThanThreshold','TreatMissingData':'breaching','AlarmActions':[topic],'ActionsEnabled':False}}
t['Description']='Production backup every 30 minutes, independent restore and failure/freshness alerts; disabled pending acceptance'
save(R/'recovery-foundation.json',t)
if not (R/'recovery-resources.json').exists():save(R/'recovery-resources.json',a.create_stack(P+'-recovery',t))
print('Independent production backup and restore workflow created; scheduling awaits successful recovery.',flush=True)
