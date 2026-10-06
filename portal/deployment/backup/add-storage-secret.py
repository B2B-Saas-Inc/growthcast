"""Reviewed v1 -> v2 backup-source secret extension; never prints secret values."""
import datetime
import json
import os
from pathlib import Path
import tempfile
import uuid
from importlib.util import spec_from_file_location, module_from_spec

ROOT=Path(__file__).resolve().parent
spec=spec_from_file_location('store_secret',ROOT/'store-secret.py')
module=module_from_spec(spec)
spec.loader.exec_module(module)
aws=module.aws

def main():
    os.umask(0o077)
    assert aws('sts','get-caller-identity')['Account']=='059393269249'
    evidence=json.loads((ROOT/'secret-evidence.json').read_text())
    secret=evidence['secretArn']
    current=aws('secretsmanager','get-secret-value','--secret-id',secret,'--version-stage','AWSCURRENT')
    assert current['VersionId']==evidence['secretVersionId'],'Unexpected current secret version'
    payload=json.loads(current['SecretString'])
    assert payload['schemaVersion']==1 and payload['role']=='gc_backup'
    assert set(payload)=={'schemaVersion','projectRef','role','databaseUrl','databaseCaCert'}
    source=Path.home()/'.config/growthcast/portal-staging'
    assert payload['databaseUrl']==(source/'backup-database-url').read_text().strip()
    assert payload['databaseCaCert']==(source/'prod-ca-2021.crt').read_text()
    reader=json.loads((source/'backup-storage-credentials.json').read_text())
    writer=json.loads((source/'storage-credentials.json').read_text())
    assert reader['projectRef']==payload['projectRef'] and reader['bucket']=='gc-atrium-private'
    assert reader['email']=='portal-backup-storage@growthcast.invalid'
    assert reader['subject']!=writer['subject'] and reader['password']!=writer['password']
    assert reader['publishableKey'].startswith('sb_publishable_')
    payload.update(schemaVersion=2,storageCredentials=reader)
    version=str(uuid.uuid4())
    with tempfile.TemporaryDirectory(prefix='growthcast-reader-secret-') as directory:
        (Path(directory)/'value.json').write_text(json.dumps(payload))
        aws('secretsmanager','put-secret-value','--secret-id',secret,'--client-request-token',version,
            '--version-stages','AWSPENDING','--secret-string','file:///input/value.json',mount=directory)
    returned=aws('secretsmanager','get-secret-value','--secret-id',secret,'--version-id',version)
    assert json.loads(returned['SecretString'])==payload
    aws('secretsmanager','update-secret-version-stage','--secret-id',secret,'--version-stage','AWSCURRENT',
        '--move-to-version-id',version,'--remove-from-version-id',current['VersionId'])
    aws('secretsmanager','update-secret-version-stage','--secret-id',secret,'--version-stage','AWSPENDING','--remove-from-version-id',version)
    final=aws('secretsmanager','get-secret-value','--secret-id',secret,'--version-stage','AWSCURRENT')
    assert final['VersionId']==version and json.loads(final['SecretString'])==payload
    evidence.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),secretVersionId=version,
        previousVersionId=current['VersionId'],schemaVersion=2,fields=list(payload),
        storageBackupSubject=reader['subject'],containsStorageWriterCredential=False)
    (ROOT/'secret-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print('Read-only database and storage credentials stored together; staged read-back and promotion verified.')

if __name__=='__main__':main()
