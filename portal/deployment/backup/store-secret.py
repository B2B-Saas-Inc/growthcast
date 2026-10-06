"""Provision the read-only backup connection; secret contents never enter output."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import tempfile

IMAGE='amazon/aws-cli@sha256:f88a264623a4e6700f226ec3f90b902b1a4010810fce1edade1f269a7c071052'
ROOT=Path(__file__).resolve().parent

def aws(*args,mount=None):
    command=['docker','run','--rm','-v',str(Path.home()/'.aws')+':/root/.aws','-e','AWS_DEFAULT_REGION=us-east-1']
    if mount: command+=['-v',str(mount)+':/input:ro']
    result=subprocess.run(command+[IMAGE,*args],capture_output=True,check=False)
    if result.returncode: raise RuntimeError('Backup secret operation failed; upstream output withheld')
    return json.loads(result.stdout) if result.stdout else {}

def main():
    os.umask(0o077)
    assert aws('sts','get-caller-identity')['Account']=='059393269249'
    stack=aws('cloudformation','describe-stacks','--stack-name','growthcast-portal-staging-recovery')['Stacks'][0]
    assert stack['StackStatus']=='UPDATE_COMPLETE'
    outputs={item['OutputKey']:item['OutputValue'] for item in stack['Outputs']}
    secret=outputs['BackupDatabaseSecretArn'];role=outputs['BackupTaskRoleArn']
    source=Path.home()/'.config/growthcast/portal-staging'
    payload={'schemaVersion':1,'projectRef':'saedetvoolpdysiyjwvg','role':'gc_backup',
        'databaseUrl':(source/'backup-database-url').read_text().strip(),
        'databaseCaCert':(source/'prod-ca-2021.crt').read_text()}
    assert 'gc_backup.saedetvoolpdysiyjwvg:' in payload['databaseUrl']
    existing=aws('secretsmanager','describe-secret','--secret-id',secret)
    assert not existing.get('VersionIdsToStages'), 'Existing secret rotation requires explicit review'
    with tempfile.TemporaryDirectory(prefix='growthcast-backup-secret-') as directory:
        path=Path(directory)/'value.json';path.write_text(json.dumps(payload))
        written=aws('secretsmanager','put-secret-value','--secret-id',secret,'--secret-string','file:///input/value.json',mount=directory)
    returned=aws('secretsmanager','get-secret-value','--secret-id',secret,'--version-id',written['VersionId'])
    assert json.loads(returned['SecretString'])==payload
    record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'secretArn':secret,'secretVersionId':written['VersionId'],
        'taskRoleArn':role,'contentVerified':True,'fields':['schemaVersion','projectRef','role','databaseUrl','databaseCaCert'],
        'containsApplicationAdminCredential':False,'taskLaunched':False,'scheduleEnabled':False}
    (ROOT/'secret-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Dedicated backup secret stored and read-back verified; no secret values emitted.')

if __name__=='__main__':main()
