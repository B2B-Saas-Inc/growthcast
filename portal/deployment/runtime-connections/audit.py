"""Read-only audit of the additional scoped connection-secret boundaries."""
import datetime,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('job',ROOT.parent/'backup/job/deploy.py');job=importlib.util.module_from_spec(spec);spec.loader.exec_module(job)
def main():
    deployment=json.loads((ROOT/'deployment.json').read_text())
    runtime=json.loads((ROOT.parent/'runtime-secrets/deployment.json').read_text())['resources']
    records={}
    for service in ['atrium','documenso']:
        name=service.title();role=runtime[name+'RoleArn'];key=runtime[name+'KeyArn'];secret=deployment['resources'][name+'SecretArn']
        info=job.aws('secretsmanager','describe-secret','--secret-id',secret)
        assert info['KmsKeyId']==key and 'AWSCURRENT' in info['VersionIdsToStages'][deployment['versions'][service]]
        policy=json.loads(job.aws('secretsmanager','get-resource-policy','--secret-id',secret)['ResourcePolicy'])['Statement']
        assert len(policy)==1 and policy[0]['Effect']=='Deny' and policy[0]['Action']=='secretsmanager:GetSecretValue'
        assert policy[0]['Principal'] in ('*',{'AWS':'*'})
        assert set(policy[0]['Condition']['ArnNotEquals']['aws:PrincipalArn'])=={role,'arn:aws:iam::059393269249:root'}
        role_name=role.split('/')[-1]
        assert not job.aws('iam','list-attached-role-policies','--role-name',role_name)['AttachedPolicies']
        assert set(job.aws('iam','list-role-policies','--role-name',role_name)['PolicyNames'])=={'OwnRuntimeSecretOnly','OwnRuntimeConnectionOnly'}
        permissions=job.aws('iam','get-role-policy','--role-name',role_name,'--policy-name','OwnRuntimeConnectionOnly')['PolicyDocument']['Statement']
        assert len(permissions)==2 and all(s['Effect']=='Allow' for s in permissions)
        assert next(s for s in permissions if s['Action']=='secretsmanager:GetSecretValue')['Resource']==secret
        decrypt=next(s for s in permissions if s['Action']=='kms:Decrypt')
        assert decrypt['Resource']==key and decrypt['Condition']['StringEquals']=={'kms:ViaService':'secretsmanager.us-east-1.amazonaws.com','kms:EncryptionContext:SecretARN':secret}
        records[service]={'exactSecretAndVersion':True,'ownKmsContextOnly':True,'otherApplicationsAndRecoveryRolesExcluded':True,'noExtraRolePolicies':True}
    (ROOT/'policy-audit-evidence.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','services':records},indent=2)+'\n')
    print('Both connection-secret versions, resource boundaries and exact role/key permissions verified.')
if __name__=='__main__':main()
