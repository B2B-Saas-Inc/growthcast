"""Publish bounded restore attestation with the independent restore role only."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent.parent/'offhost'))
from roundtrip import provision_sessions,run,success,IMAGE,BUCKET
NODE='node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf'

def publish(evidence,state='VERIFIED'):
    os.umask(0o077)
    receipt=evidence['uploadReceipt']
    pointer=next(event for event in evidence['taskEvents'] if event['stage']=='UPLOADED')
    if state=='VERIFIED':
        assert evidence['result']=='passed'
        assert all(evidence[field] is True for field in ['exactS3Versions','kmsRecovery','tamperAndWrongKeyDenied','targetOverwriteDenied','restoredApplicationLoginsDisabled'])
    else:assert state=='FAILED'
    run_id=receipt['runId']
    backup=datetime.datetime.strptime(run_id.split('Z-')[0]+'Z','%Y%m%dT%H%M%S%fZ').replace(tzinfo=datetime.timezone.utc)
    record={'schemaVersion':1,'environment':'staging','state':state,'runId':run_id,'backupAt':backup.isoformat(timespec='milliseconds').replace('+00:00','Z'),
        'checkedAt':evidence['checkedAt'],'scope':'isolated-local-database-and-object-restore',
        'archive':{key:receipt[key] for key in ['bucket','key','versionId','sha256']},
        'managedKey':receipt['managedKey'],
        'uploadReceipt':{'key':pointer['receiptKey'],'versionId':pointer['receiptVersion']},
        'taskArn':evidence['taskArn'],'evidenceSha256':hashlib.sha256(json.dumps(evidence,sort_keys=True).encode()).hexdigest()}
    raw=success(subprocess.run(['docker','run','--rm','-i','--network','none','-v',str(ROOT)+':/checks:ro',NODE,'node','/checks/records.mjs','validate'],input=json.dumps(record).encode(),capture_output=True))
    record=json.loads(raw);key='verification/staging/'+run_id+'/'+record['evidenceSha256']+'.json'
    with tempfile.TemporaryDirectory(prefix='growthcast-verification-') as directory:
        folder=Path(directory);provision_sessions(folder);(folder/'record.json').write_bytes(raw)
        def scoped(role,*args):
            return run(['docker','run','--rm','-v',str(folder/role)+':/credentials:ro','-v',str(folder)+':/records','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*args])
        # The archive uploader cannot promote its own upload to verified.
        denied=scoped('upload','s3api','put-object','--bucket',BUCKET,'--key',key,'--body','/records/record.json','--if-none-match','*')
        assert denied.returncode!=0 and b'AccessDenied' in denied.stderr,'Uploader verification-write boundary failed'
        result=scoped('restore','s3api','put-object','--bucket',BUCKET,'--key',key,'--body','/records/record.json','--if-none-match','*')
        version=json.loads(success(result))['VersionId'];assert version and version!='null'
        repeat=scoped('restore','s3api','put-object','--bucket',BUCKET,'--key',key,'--body','/records/record.json','--if-none-match','*')
        assert repeat.returncode!=0 and b'PreconditionFailed' in repeat.stderr
        success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',key,'--version-id',version,'/records/returned.json'))
        assert json.loads((folder/'returned.json').read_text())==record
    proof={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bucket':BUCKET,'key':key,'versionId':version,'record':record,
        'uploaderWriteDenied':True,'overwriteDenied':True,'exactVersionReadBack':True}
    (ROOT/'publication-evidence.json').write_text(json.dumps(proof,indent=2)+'\n')
    print('Independent verification record persisted; uploader denial, create-only write and exact-version read-back passed.')
    return proof
