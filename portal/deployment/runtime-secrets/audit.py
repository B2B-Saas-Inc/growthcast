"""Read-only live policy/key/version and probe-cleanup verification."""
import datetime,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
deployment=json.loads((ROOT/'deployment.json').read_text());resources=deployment['resources'];record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'services':{}}
for service in ['atrium','documenso']:
    name=service.title();role=resources[name+'RoleArn'];key=resources[name+'KeyArn'];secret=resources[name+'SecretArn']
    metadata=job.aws('kms','describe-key','--key-id',key)['KeyMetadata'];assert metadata['KeyState']=='Enabled' and metadata['KeyManager']=='CUSTOMER'
    assert job.aws('kms','get-key-rotation-status','--key-id',key)['KeyRotationEnabled']
    key_policy=json.loads(job.aws('kms','get-key-policy','--key-id',key,'--policy-name','default')['Policy'])
    exclusions=next(s for s in key_policy['Statement'] if s.get('Sid')=='ExcludeOtherRuntimeAndRecoveryReaders')
    assert exclusions['Effect']=='Deny' and exclusions['Action']=='kms:Decrypt'
    assert set(exclusions['Condition']['ArnNotEquals']['aws:PrincipalArn'])=={role,'arn:aws:iam::059393269249:root'}
    direct=next(s for s in key_policy['Statement'] if s.get('Sid')=='RuntimeDecryptOnlyThroughSecretsManager')
    assert direct['Effect']=='Deny' and direct['Condition']=={'ArnEquals':{'aws:PrincipalArn':role},'StringNotEquals':{'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com'}}
    info=job.aws('secretsmanager','describe-secret','--secret-id',secret);assert info['KmsKeyId']==key and 'AWSCURRENT' in info['VersionIdsToStages'][deployment['versions'][service]]
    policy=json.loads(job.aws('secretsmanager','get-resource-policy','--secret-id',secret)['ResourcePolicy'])
    boundary=next(s for s in policy['Statement'] if s.get('Sid')=='OnlyApplicationOrAccountRecovery')
    assert boundary['Effect']=='Deny' and boundary['Action']=='secretsmanager:GetSecretValue'
    assert set(boundary['Condition']['ArnNotEquals']['aws:PrincipalArn'])=={role,'arn:aws:iam::059393269249:root'}
    assert not job.aws('iam','list-attached-role-policies','--role-name',role.split('/')[-1])['AttachedPolicies']
    connection_path=ROOT.parent/'runtime-connections/deployment.json'
    expected_policies={'OwnRuntimeSecretOnly'}
    if connection_path.exists():
        connection=json.loads(connection_path.read_text())['resources'][name+'SecretArn']
        expected_policies.add('OwnRuntimeConnectionOnly')
        extra=job.aws('iam','get-role-policy','--role-name',role.split('/')[-1],'--policy-name','OwnRuntimeConnectionOnly')['PolicyDocument']['Statement']
        assert len(extra)==2 and all(statement['Effect']=='Allow' for statement in extra)
        assert next(statement for statement in extra if statement['Action']=='secretsmanager:GetSecretValue')['Resource']==connection
        decrypt_connection=next(statement for statement in extra if statement['Action']=='kms:Decrypt')
        assert decrypt_connection['Resource']==key and decrypt_connection['Condition']['StringEquals']=={'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com','kms:EncryptionContext:SecretARN':connection}
    assert set(job.aws('iam','list-role-policies','--role-name',role.split('/')[-1])['PolicyNames'])==expected_policies
    permissions=job.aws('iam','get-role-policy','--role-name',role.split('/')[-1],'--policy-name','OwnRuntimeSecretOnly')['PolicyDocument']['Statement']
    assert len(permissions)==2
    assert next(s for s in permissions if s['Action']=='secretsmanager:GetSecretValue')['Resource']==secret
    decrypt=next(s for s in permissions if s['Action']=='kms:Decrypt');assert decrypt['Resource']==key and decrypt['Condition']['StringEquals']=={'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com','kms:EncryptionContext:SecretARN':secret}
    trust=job.aws('iam','get-role','--role-name',role.split('/')[-1])['Role']['AssumeRolePolicyDocument']['Statement'];assert len(trust)==1 and trust[0]['Principal']=={'Service':'ecs-tasks.amazonaws.com'} and trust[0]['Condition']['StringEquals']['aws:SourceAccount']=='059393269249'
    assert trust[0]['Condition']['ArnLike']['aws:SourceArn']=='arn:aws:ecs:us-east-1:059393269249:*'
    for statement in [exclusions,direct,boundary]:assert statement['Principal'] in ('*',{'AWS':'*'})
    record['services'][service]={'separateKeyEnabledAndRotating':True,'secretVersionCurrent':True,'exactSecretAndContextPermissions':True,'resourcePoliciesExcludeOtherReaders':True,'ecsOnlyTrust':True}
count=0
for path in ROOT.glob('*probe-tasks.json'):
    probes=json.loads(path.read_text())
    states=job.aws('ecs','describe-tasks','--cluster','growthcast-portal-staging-backup','--tasks',*[t['arn'] for t in probes['tasks']])['tasks'];assert len(states)==len(probes['tasks']) and all(s['lastStatus']=='STOPPED' for s in states)
    for definition in probes['definitions']:assert job.aws('ecs','describe-task-definition','--task-definition',definition)['taskDefinition']['status']=='INACTIVE'
    count+=len(states)
record.update({'result':'passed','stoppedProbeTasks':count,'temporaryDefinitionsInactive':True})
(ROOT/'audit-evidence.json').write_text(json.dumps(record,indent=2)+'\n');print('Live key/secret/role boundaries and all temporary probe cleanup verified.')
