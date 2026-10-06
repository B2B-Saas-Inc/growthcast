"""Independent read-only cleanup and secret-boundary audit."""
import json,subprocess,datetime
from pathlib import Path
from aws import aws
R=Path(__file__).resolve().parent;d=json.loads((R/'resources.json').read_text());cert=json.loads((R/'certificate.json').read_text());e=json.loads((R/'cloud-signing-task.json').read_text())
assert not aws('iam','list-access-keys','--user-name','growthcast-portal-staging-secret-recovery-broker')['AccessKeyMetadata']
assert aws('ecs','describe-tasks','--cluster',e['cluster'],'--tasks',e['task'])['tasks'][0]['lastStatus']=='STOPPED'
assert aws('ecs','describe-task-definition','--task-definition',e['taskDefinition'])['taskDefinition']['status']=='INACTIVE'
for key in ['SigningKeyArn','EscrowKeyArn']:assert aws('kms','get-key-rotation-status','--key-id',d[key])['KeyRotationEnabled']
s=aws('secretsmanager','describe-secret','--secret-id',cert['arn']);assert cert['version'] in s['VersionIdsToStages']
denials=[]
for role in ['growthcast-portal-staging-atrium-runtime','growthcast-portal-staging-backup-task','growthcast-portal-staging-restore-task']:
 for action,resource in [('secretsmanager:GetSecretValue',cert['arn']),('kms:Decrypt',d['EscrowKeyArn'])]:
  rows=aws('iam','simulate-principal-policy','--policy-source-arn','arn:aws:iam::059393269249:role/'+role,'--action-names',action,'--resource-arns',resource)['EvaluationResults'];assert all(x['EvalDecision']!='allowed' for x in rows);denials.append({'role':role,'action':action,'denied':True})
for command in [['docker','ps','-a','--format','{{.Names}}'],['docker','volume','ls','--format','{{.Name}}'],['docker','network','ls','--format','{{.Name}}']]:
 result=subprocess.run(command,capture_output=True,text=True,check=True);assert not any(x.startswith('growthcast-runtime-') for x in result.stdout.splitlines()),'Runtime fixture resource remains'
repo=json.loads(subprocess.run(['gh','repo','view','B2B-Saas-Inc/growthcast-client-portal','--json','url,isPrivate'],capture_output=True,text=True,check=True).stdout);assert repo['isPrivate']
record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'brokerRetainedAccessKeys':0,'cloudProbeStopped':True,'cloudTaskDefinitionInactive':True,'automaticKmsRotationEnabled':True,'certificateVersionPresent':True,'denialPolicyChecks':denials,'isolatedRuntimeFixturesRemoved':True,'repository':repo};(R/'audit-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Escrow separation, key rotation configuration, probe/fixture cleanup and private repository verified.')
