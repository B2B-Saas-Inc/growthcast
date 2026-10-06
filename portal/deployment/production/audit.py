from common import *
f=load(R/'foundation-resources.json');api=load(R/'api-resources.json');ref=load(R/'database.json')['projectRef'];checks={}
for name in ['foundation','api','recovery','secret-escrow']:
 s=aws('cloudformation','describe-stacks','--stack-name','growthcast-portal-production-'+name)['Stacks'][0];assert s['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE'];checks[name]=s['StackStatus']
svc=aws('ecs','describe-services','--cluster',api['ClusterArn'],'--services',api['ServiceArn'])['services'][0];assert svc['runningCount']==1 and svc['pendingCount']==0
assert len(svc['deployments'])==1 and svc['deployments'][0]['rolloutState']=='COMPLETED'
t=aws('ecs','describe-task-definition','--task-definition',svc['taskDefinition'])['taskDefinition'];assert t['taskRoleArn']==f['RuntimeRoleArn'];assert t['containerDefinitions'][0]['image']==load(R/'images.json')['api'];assert t['containerDefinitions'][0]['readonlyRootFilesystem']
assert all(x['TargetHealth']['State']=='healthy' for x in aws('elbv2','describe-target-health','--target-group-arn',api['TargetGroupArn'])['TargetHealthDescriptions'])
assert supa('/v1/projects/'+ref)['status']=='ACTIVE_HEALTHY'
roles=supa('/v1/projects/'+ref+'/database/query',{'query':"SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname LIKE 'gc_%' ORDER BY rolname",'read_only':True})
assert {r['rolname'] for r in roles if r['rolcanlogin']}=={'gc_app','gc_backup'}
objects=supa('/v1/projects/'+ref+'/database/query',{'query':"SELECT count(*)::int n FROM storage.objects WHERE bucket_id='gc-atrium-private'",'read_only':True});assert objects[0]['n']==0
settings=supa('/v1/projects/'+ref+'/postgrest');assert settings['db_schema']=='portal_api'
ssl=supa('/v1/projects/'+ref+'/ssl-enforcement');assert ssl['currentConfig']['database'] and ssl['appliedSuccessfully']
project=load(R/'web-project.json')['projectId'];env=vercel('/v10/projects/'+project+'/env')['envs'];assert {e['key'] for e in env}=={'PORTAL_WEB_URL','PORTAL_API_URL','PORTAL_API_ORIGIN_PROOF'};assert all(e['target']==['production'] for e in env)
assert vercel('/v9/projects/prj_CMSykF9Wbj5YNwQAgl1lANn5tX3w')['ssoProtection']['deploymentType']=='all'
# Explicitly verify production roles cannot obtain staging secrets, and staging runtime cannot obtain production secrets.
staging=load(D/'runtime-secrets/runtime-pins.json')['atrium']['arn'];cases=[]
for role,secret in [(f[k],staging) for k in ['RuntimeRoleArn','BackupRoleArn','RestoreRoleArn']]+[('arn:aws:iam::059393269249:role/growthcast-portal-staging-atrium-runtime',f['RuntimeSecretArn'])]:
 result=aws('iam','simulate-principal-policy','--policy-source-arn',role,'--action-names','secretsmanager:GetSecretValue','--resource-arns',secret)['EvaluationResults'];assert all(x['EvalDecision'] in ['implicitDeny','explicitDeny'] for x in result);cases.append({'role':role,'crossEnvironmentSecretDenied':True})
rule=aws('events','describe-rule','--name','growthcast-portal-production-backup-workflow');assert rule['State']=='ENABLED' and rule['ScheduleExpression']=='rate(30 minutes)'
alarms=aws('cloudwatch','describe-alarms','--alarm-name-prefix','growthcast-portal-production-')['MetricAlarms'];assert alarms and all(x['ActionsEnabled'] and x['AlarmActions'] for x in alarms)
lock=aws('dynamodb','scan','--table-name','growthcast-portal-production-backup-lock');assert lock['Count']==0
save(R/'audit-evidence.json',{'checkedAt':now(),'stacks':checks,'healthyIndependentApi':True,'currentApiImage':t['containerDefinitions'][0]['image'],'privateSchemasAndTls':True,'roles':roles,'sourceBucketObjects':0,'productionOnlyWebEnvironment':True,'stagingStillProtected':True,'crossEnvironmentDenials':cases,'backupSchedule':rule['ScheduleExpression'],'alertsEnabled':len(alarms),'recoveryLockReleased':True})
print('Independent production infrastructure, data boundaries, health and recovery audit passed.')
