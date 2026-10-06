"""One intentional nonzero ECS exit through the deployed alert rule, without source access."""
import importlib.util,json,pathlib,tempfile,datetime,time
r=pathlib.Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('j',r.parent/'job/deploy.py');j=importlib.util.module_from_spec(s);s.loader.exec_module(j)
out=r/'failure-route-evidence.json'
assert not out.exists(),'Existing drill must not be repeated silently'
stack=j.aws('cloudformation','describe-stacks','--stack-name',j.STACK)['Stacks'][0]
o={x['OutputKey']:x['OutputValue'] for x in stack['Outputs']}
t=j.aws('ecs','describe-task-definition','--task-definition',o['TaskDefinitionArn'])['taskDefinition']
allowed=['family','executionRoleArn','networkMode','containerDefinitions','volumes','requiresCompatibilities','cpu','memory','runtimePlatform','ephemeralStorage']
request={k:t[k] for k in allowed if k in t}
assert len(request['containerDefinitions'])==1
c=request['containerDefinitions'][0];c['entryPoint']=['node','-e'];c['command']=['console.log("GrowthCast intentional failure-alert acceptance test; no backup capture performed"); process.exit(42)'];c['environment']=[];c.pop('secrets',None);c.pop('healthCheck',None)
start=datetime.datetime.now(datetime.timezone.utc)
record={'startedAt':start.isoformat(),'intentionalFailure':True,'sourceCredentialsAvailable':False,'backupCaptureExecuted':False,'backupScheduleEnabled':False}
arn=None;taskarn=None
try:
 with tempfile.TemporaryDirectory() as d:
  p=pathlib.Path(d);(p/'request.json').write_text(json.dumps(request));td=j.aws('ecs','register-task-definition','--cli-input-json','file:///input/request.json',mount=p)['taskDefinition'];arn=td['taskDefinitionArn'];assert 'taskRoleArn' not in td
  run={'cluster':o['ClusterArn'],'taskDefinition':arn,'launchType':'FARGATE','count':1,'startedBy':'growthcast-failure-alert-test','networkConfiguration':{'awsvpcConfiguration':{'subnets':[o['SubnetId']],'securityGroups':[o['SecurityGroupId']],'assignPublicIp':'ENABLED'}}}
  (p/'run.json').write_text(json.dumps(run));v=j.aws('ecs','run-task','--cli-input-json','file:///input/run.json',mount=p);assert not v.get('failures');taskarn=v['tasks'][0]['taskArn'];record.update(taskArn=taskarn,taskDefinitionArn=arn);out.write_text(json.dumps(record,indent=2)+'\n');print('Intentional failure task launched without a task role or source credentials.',flush=True)
 for _ in range(60):
  task=j.aws('ecs','describe-tasks','--cluster',o['ClusterArn'],'--tasks',taskarn)['tasks'][0]
  if task['lastStatus']=='STOPPED':break
  time.sleep(5)
 else:raise RuntimeError('Acceptance task timeout')
 assert task['containers'][0]['exitCode']==42
 record.update(exitCode=42,stopCode=task['stopCode'],stoppedAt=task['stoppedAt'])
 # EventBridge metrics can arrive several minutes after task completion.
 for _ in range(40):
  metric=j.aws('cloudwatch','get-metric-statistics','--namespace','AWS/Events','--metric-name','SuccessfulInvocationAttempts','--dimensions','Name=RuleName,Value=growthcast-portal-staging-backup-failed','--start-time',start.isoformat(),'--end-time',datetime.datetime.now(datetime.timezone.utc).isoformat(),'--period','60','--statistics','Sum')
  if sum(x['Sum'] for x in metric['Datapoints'])>=1:break
  time.sleep(10)
 else:raise RuntimeError('No failure-rule invocation observed within bounded window')
 record.update(successfulRuleInvocations=metric['Datapoints'],result='passed-eventbridge-target-delivery',inboxReceiptConfirmed=False)
 print('Nonzero task exit and actual failure-rule invocation verified.',flush=True)
finally:
 if taskarn:
  task=j.aws('ecs','describe-tasks','--cluster',o['ClusterArn'],'--tasks',taskarn)['tasks'][0]
  if task['lastStatus']!='STOPPED':j.aws('ecs','stop-task','--cluster',o['ClusterArn'],'--task',taskarn,'--reason','Failure route acceptance cleanup')
 if arn:j.aws('ecs','deregister-task-definition','--task-definition',arn);record['testRevisionDeregistered']=True
 record['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(record,indent=2)+'\n')
