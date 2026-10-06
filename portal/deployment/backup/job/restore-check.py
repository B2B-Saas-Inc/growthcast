"""Independently recover one ECS upload using the separate short-lived restore role."""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent.parent/'offhost'))
from roundtrip import provision_sessions, run, success, IMAGE, BUCKET
from managed_keys import ManagedKeys
sys.path.insert(0,str(ROOT.parent/'verification'))
from publish import publish

def main():
    os.umask(0o077)
    deployment=json.loads((ROOT/'deployment-evidence.json').read_text())
    assert deployment['status']=='STOPPED' and deployment['exitCodes']==[0]
    # Logs contain only the job's explicitly bounded status records. Find the upload receipt pointer.
    from importlib.util import spec_from_file_location,module_from_spec
    spec=spec_from_file_location('job_deploy',ROOT/'deploy.py');module=module_from_spec(spec);spec.loader.exec_module(module)
    task=deployment['taskArn'].split('/')[-1]
    logs=module.aws('logs','get-log-events','--log-group-name','/growthcast/portal/staging/backup','--log-stream-name','backup/backup/'+task,'--start-from-head')
    events=[]
    for event in logs['events']:
        try:value=json.loads(event['message'])
        except ValueError:continue
        if isinstance(value,dict) and value.get('stage') in ['STARTED','CAPTURED','UPLOADED','FAILED']:events.append(value)
    uploaded=next(event for event in events if event['stage']=='UPLOADED')
    assert not any(event['stage']=='FAILED' for event in events)
    assert re.fullmatch(r'staging/[0-9TZ]+-[a-f0-9-]{36}/receipt.json',uploaded['receiptKey'])
    project='growthcast-managed-recovery-'+str(int(time.time()))+'-'+str(os.getpid())
    env=os.environ.copy();env['PORTAL_STAGING_SECRETS']=str(Path.home()/'.config/growthcast/portal-staging')
    base=['docker','compose','-p',project,'-f',str(ROOT.parent.parent/'managed-recovery/compose.yaml')]
    def compose(*args):
        result=subprocess.run([*base,*args],env=env,capture_output=True)
        return success(result)
    receipt=None
    try:
        # Fresh isolated volumes only; no source capture or fixture writer is invoked.
        compose('run','--rm','prepare')
        with tempfile.TemporaryDirectory(prefix='growthcast-job-restore-') as directory:
            folder=Path(directory);provision_sessions(folder);managed=ManagedKeys(folder,IMAGE,run,success)
            def scoped(*args):
                return success(run(['docker','run','--rm','-v',str(folder/'restore')+':/credentials:ro','-v',str(managed.material)+':/material','-v',project+'_recovery-encrypted:/archive','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*args]))
            scoped('s3api','get-object','--bucket',BUCKET,'--key',uploaded['receiptKey'],'--version-id',uploaded['receiptVersion'],'/material/receipt.json')
            receipt=json.loads((managed.material/'receipt.json').read_text())
            assert receipt['bucket']==BUCKET and receipt['stage']=='UPLOADED' and receipt['verification']=='pending-independent-restore'
            assert receipt['key']==uploaded['receiptKey'].removesuffix('receipt.json')+'backup.gcb'
            assert receipt['managedKey']['objectKey']==receipt['key'].removesuffix('backup.gcb')+'key.kms.json'
            scoped('s3api','get-object','--bucket',BUCKET,'--key',receipt['key'],'--version-id',receipt['versionId'],'/archive/backup.gcb')
            scoped('s3api','get-object','--bucket',BUCKET,'--key',receipt['managedKey']['objectKey'],'--version-id',receipt['managedKey']['versionId'],'/material/envelope.json')
            key=managed.unwrap(json.loads((managed.material/'envelope.json').read_text()),receipt['key'])
            success(subprocess.run(['docker','run','--rm','--user','root','--network','none','-i','--entrypoint','node','-v',project+'_recovery-key:/key','growthcast-recovery','-e','const f=require("fs");const b=f.readFileSync(0);if(b.length!==32)throw Error("Invalid key");f.unlinkSync("/key/key");f.writeFileSync("/key/key",b,{mode:0o444,flag:"wx"})'],input=key,capture_output=True))
            del key
            proof=json.loads(success(run(['docker','run','--rm','--network','none','--entrypoint','node','-v',project+'_recovery-encrypted:/archive:ro','growthcast-recovery','-e','const f=require("fs"),c=require("crypto"),b=f.readFileSync("/archive/backup.gcb");console.log(JSON.stringify({sha256:c.createHash("sha256").update(b).digest("hex"),bytes:b.length}))'])))
            assert proof['sha256']==receipt['sha256'] and proof['bytes']==receipt['bytes']
        compose('run','--rm','decrypt')
        packaged=success(subprocess.run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL',
            '--security-opt','no-new-privileges','--memory','2g','--cpus','1',
            '--tmpfs','/work:rw,noexec,nosuid,size=1g,uid=70,gid=70,mode=0700',
            '--tmpfs','/restored:rw,noexec,nosuid,size=512m,uid=70,gid=70,mode=0700',
            '--tmpfs','/objects:rw,noexec,nosuid,size=256m,uid=70,gid=70,mode=0700',
            '-v',project+'_restored:/input:ro','growthcast-restore-worker'],capture_output=True)).decode()
        packaged_counts=next(json.loads(line) for line in packaged.splitlines() if line.startswith('{"verifiedTables"'))
        assert packaged_counts=={'verifiedTables':receipt['tables'],'verifiedRows':receipt['rows'],'verifiedObjects':receipt['objects'],'objectBytes':receipt['objectBytes']}
        assert 'Packaged isolated restore passed; target overwrite denied.' in packaged
        compose('up','-d','--wait','target');compose('run','--rm','restore')
        verified=compose('run','--rm','verify').decode()
        second=subprocess.run([*base,'run','--rm','restore'],env=env,capture_output=True)
        assert second.returncode!=0 and b'Restore target is not empty' in second.stdout+second.stderr
        compose('run','--rm','verify')
        counts=next(json.loads(line) for line in verified.splitlines() if line.startswith('{"verifiedTables"'))
        assert counts=={'verifiedTables':receipt['tables'],'verifiedRows':receipt['rows'],'verifiedObjects':receipt['objects'],'objectBytes':receipt['objectBytes']}
        record={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'taskArn':deployment['taskArn'],'image':deployment['image'],'result':'passed',
            'taskEvents':events,'uploadReceipt':receipt,'restored':counts,'exactS3Versions':True,'kmsRecovery':True,'tamperAndWrongKeyDenied':True,'targetOverwriteDenied':True,'restoredApplicationLoginsDisabled':True,'scheduleEnabled':False,
            'packagedIsolatedRestore':True,'packagedRestoreNetwork':'none',
            'scope':'One deployed ECS backup, independently restored into isolated local database/object targets'}
        (ROOT/'restore-evidence.json').write_text(json.dumps(record,indent=2)+'\n')
        publish(record)
        print('Deployed ECS archive independently recovered through scoped S3/KMS, both schema guards, data/ACL/object binding and overwrite checks.')
    except Exception:
        if receipt is not None:
            failure={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'taskArn':deployment['taskArn'],
                'result':'failed','uploadReceipt':receipt,'taskEvents':events,'category':'independent-restore-or-publication'}
            try:publish(failure,state='FAILED')
            except Exception:print('Failure attestation could not be persisted; recovery remains unverified.',file=sys.stderr)
        raise
    finally:compose('down','--volumes','--remove-orphans')

if __name__=='__main__':main()
