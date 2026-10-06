"""Explicit opt-in transfer of an encrypted synthetic recovery fixture; never reads live DBs."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid
from managed_keys import ManagedKeys

IMAGE = 'amazon/aws-cli@sha256:f88a264623a4e6700f226ec3f90b902b1a4010810fce1edade1f269a7c071052'
ACCOUNT = '059393269249'
BUCKET = 'growthcast-portal-staging-recovery-' + ACCOUNT

def run(args):
    return subprocess.run(args, capture_output=True, check=False)

def success(result):
    if result.returncode:
        match = re.search(rb'An error occurred \(([A-Za-z0-9]+)\)', result.stderr)
        code = match.group(1).decode() if match else 'Unclassified'
        raise RuntimeError('Recovery command failed: '+code+'; upstream output withheld')
    return result.stdout

def admin(*args):
    data = success(run(['docker', 'run', '--rm', '-v', str(Path.home()/'.aws')+':/root/.aws',
        '-e', 'AWS_DEFAULT_REGION=us-east-1', IMAGE, *args]))
    return json.loads(data) if data else {}

def provision_sessions(folder, monitor=False):
    broker_name = 'growthcast-portal-staging-recovery-broker'
    # Root login cannot AssumeRole. The broker can only assume these two archive roles.
    assert not admin('iam','list-access-keys','--user-name',broker_name)['AccessKeyMetadata'], 'Broker must have no retained keys'
    access = admin('iam','create-access-key','--user-name',broker_name)['AccessKey']
    try:
        (folder/'broker').write_text('[default]\naws_access_key_id='+access['AccessKeyId']+'\naws_secret_access_key='+access['SecretAccessKey']+'\n')
        for role, name in [('upload','backup'),('restore','restore')]+([('monitor','recovery-monitor')] if monitor else []):
            command = ['docker','run','--rm','-v',str(folder/'broker')+':/credentials:ro',
                '-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,
                'sts','assume-role','--role-arn',f'arn:aws:iam::{ACCOUNT}:role/growthcast-portal-staging-{name}',
                '--role-session-name','recovery-'+role,'--duration-seconds','900']
            for attempt in range(8):
                result = run(command)
                if result.returncode == 0: break
                if not any(code in result.stderr for code in [b'InvalidClientTokenId',b'AccessDenied']): break
                time.sleep(2)
            creds = json.loads(success(result))['Credentials']
            (folder/role).write_text('[default]\naws_access_key_id='+creds['AccessKeyId']+'\naws_secret_access_key='+creds['SecretAccessKey']+'\naws_session_token='+creds['SessionToken']+'\n')
    finally:
        admin('iam','delete-access-key','--user-name',broker_name,'--access-key-id',access['AccessKeyId'])
        (folder/'broker').unlink(missing_ok=True)
    del access
    assert not admin('iam','list-access-keys','--user-name',broker_name)['AccessKeyMetadata']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('project')
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--scope', choices=['provider-fixture','managed-supabase'], default='provider-fixture')
    args = parser.parse_args()
    prefix = 'growthcast-gateway' if args.scope == 'provider-fixture' else 'growthcast-managed-recovery'
    if not re.fullmatch(prefix+r'-[0-9]+-[0-9]+', args.project):
        raise ValueError('Disposable gateway project required')
    assert admin('sts', 'get-caller-identity')['Account'] == ACCOUNT
    os.umask(0o077)
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + str(uuid.uuid4())
    escrow = Path.home()/'.config/growthcast/portal-staging/recovery-keys'/run_id
    escrow.mkdir(parents=True, mode=0o700)
    volume = args.project + '_recovery-encrypted'
    def local(code, target=volume):
        return success(run(['docker','run','--rm','--user','root','--network','none','--entrypoint','node',
            '-v',target+':/archive','growthcast-recovery','-e',code]))
    # Plain data key is sent only to the narrowly scoped KMS operation, never to S3.
    key = local('process.stdout.write(require("fs").readFileSync("/archive/key"))', args.project+'_recovery-key')
    assert len(key) == 32
    describe = 'const b=require("fs").readFileSync("/archive/backup.gcb"); if(b.subarray(0,8).toString()!=="GCBACK01")throw Error("Encrypted archive required"); console.log(JSON.stringify({sha256:require("crypto").createHash("sha256").update(b).digest("hex"),bytes:b.length}));'
    before = json.loads(local(describe))
    assert 36 < before['bytes'] < 256*1024*1024
    object_key = 'staging/'+run_id+'/backup.gcb'
    with tempfile.TemporaryDirectory(prefix='growthcast-archive-credentials-') as directory:
        folder = Path(directory)
        provision_sessions(folder)
        managed = ManagedKeys(folder, IMAGE, run, success)
        envelope = managed.wrap(key, object_key)
        managed.verify_denials(envelope, object_key)
        (managed.material/'envelope.json').write_text(json.dumps(envelope))
        def scoped(role, *command):
            return run(['docker','run','--rm','-v',str(folder/role)+':/credentials:ro',
                '-v',volume+':/archive','-v',str(managed.material)+':/material','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials',
                '-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*command])
        def denied(result, code):
            assert result.returncode != 0 and code.encode() in result.stderr, 'Expected scoped denial'
        put = ['s3api','put-object','--bucket',BUCKET,'--key',object_key,'--body','/archive/backup.gcb','--if-none-match','*']
        envelope_key = object_key.removesuffix('backup.gcb')+'key.kms.json'
        envelope_version = json.loads(success(scoped('upload','s3api','put-object','--bucket',BUCKET,'--key',envelope_key,
            '--body','/material/envelope.json','--if-none-match','*')))['VersionId']
        uploaded = json.loads(success(scoped('upload', *put)))
        version = uploaded['VersionId']
        pending={'bucket':BUCKET,'key':object_key,'versionId':version,**before,
            'managedKey':{'keyArn':managed.arn,'objectKey':envelope_key,'versionId':envelope_version},
            'status':'uploaded-restore-unverified'}
        (escrow/'receipt.json').write_text(json.dumps(pending,indent=2)+'\n')
        denied(scoped('upload', *put), 'PreconditionFailed')
        denied(scoped('upload', *put[:-2]), 'AccessDenied')
        denied(scoped('upload','s3api','get-object','--bucket',BUCKET,'--key',object_key,'/archive/forbidden.gcb'),'AccessDenied')
        denied(scoped('upload','s3api','delete-object','--bucket',BUCKET,'--key',object_key),'AccessDenied')
        denied(scoped('upload','s3api','put-object','--bucket',BUCKET,'--key','outside/'+run_id,'--body','/archive/backup.gcb','--if-none-match','*'),'AccessDenied')
        denied(scoped('restore', *put), 'AccessDenied')
        # Force decryption to consume ciphertext downloaded from the exact remote version.
        local('require("fs").unlinkSync("/archive/backup.gcb")')
        local('require("fs").unlinkSync("/archive/key")', args.project+'_recovery-key')
        success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',object_key,'--version-id',version,'/archive/backup.gcb'))
        success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',envelope_key,'--version-id',envelope_version,'/material/downloaded-envelope.json'))
        recovered_key = managed.unwrap(json.loads((managed.material/'downloaded-envelope.json').read_text()),object_key)
        assert recovered_key == key, 'Managed key recovery mismatch'
        success(subprocess.run(['docker','run','--rm','--user','root','-i','--network','none','--entrypoint','node',
            '-v',args.project+'_recovery-key:/key','growthcast-recovery','-e',
            'let b=[];process.stdin.on("data",v=>b.push(v));process.stdin.on("end",()=>{const k=Buffer.concat(b);if(k.length!==32)process.exit(1);require("fs").writeFileSync("/key/key",k,{flag:"wx",mode:0o444});});'],
            input=recovered_key,capture_output=True,check=False))
        del recovered_key, key
        after = json.loads(local(describe))
        assert before == after, 'Downloaded archive hash/length mismatch'
    receipt = {'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bucket':BUCKET,'key':object_key,
        'versionId':version,**before,'checks':['create-only upload','duplicate and unconditional overwrite denied','upload role cannot read/delete or write outside staging prefix','restore role cannot upload','original local ciphertext removed before exact-version download','downloaded SHA-256 and size match','KMS uploader-decrypt, restore-encrypt, wrong-project, wrong-archive and tamper denials','original local key removed before exact-version envelope retrieval and KMS unwrap'],
        'keyEscrow':'KMS context-bound wrapped data key; original local key removed before recovery',
        'managedKey':{'keyArn':managed.arn,'objectKey':envelope_key,'versionId':envelope_version},
        'scope':('Synthetic managed Documenso/gateway databases and four signed PDFs' if args.scope == 'provider-fixture' else 'Live staging Supabase private schemas and synthetic Storage object; isolated local restore')}
    (escrow/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    Path(args.receipt).write_text(json.dumps(receipt,indent=2)+'\n')
    print('Encrypted archive uploaded and downloaded by separate scoped roles; hashes and permission denials passed.')

if __name__ == '__main__':
    main()
