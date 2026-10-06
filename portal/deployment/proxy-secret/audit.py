"""Read-only audit of the protected project's narrow preview proof handoff."""
import datetime,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('transfer',ROOT/'transfer.py');transfer=importlib.util.module_from_spec(spec);spec.loader.exec_module(transfer)
def main():
    evidence=json.loads((ROOT/'evidence.json').read_text())
    project=transfer.vercel('/v9/projects/'+transfer.PROJECT)
    assert project['id']==transfer.PROJECT and project['accountId']==transfer.TEAM and project['name']=='growthcast-clients-staging'
    assert project['ssoProtection']['deploymentType']=='all'
    envs=transfer.vercel('/v10/projects/'+transfer.PROJECT+'/env')['envs']
    proof=[v for v in envs if v['key']==transfer.KEY];assert len(proof)==1
    assert proof[0]['id']==evidence['variableId'] and proof[0]['type']=='sensitive' and proof[0]['target']==['preview']
    assert not any(any(term in v['key'] for term in ['DATABASE','BETTER_AUTH_SECRET','NEXTAUTH_SECRET','ENCRYPTION_KEY','AWS_SECRET']) for v in envs)
    source=transfer.job.aws('secretsmanager','describe-secret','--secret-id',evidence['sourceSecretArn'])
    assert 'AWSCURRENT' in source['VersionIdsToStages'][evidence['sourceVersion']]
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','projectId':transfer.PROJECT,'protectedAllDeployments':True,'sensitivePreviewProofOnly':True,'applicationCredentialVariablesAbsent':True,'sourceVersionCurrent':True,'runtimeConsumptionVerified':False}
    (ROOT/'audit-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Protected project, sensitive preview scope, source version and absence of application credential variables verified.')
if __name__=='__main__':main()
