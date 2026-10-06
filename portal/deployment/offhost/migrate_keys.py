"""Migrate only generated staging archive keys, verifying ciphertext and managed recovery first."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from roundtrip import IMAGE, BUCKET, admin, provision_sessions, run, success
from managed_keys import ManagedKeys

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--receipt',required=True)
    args=parser.parse_args()
    os.umask(0o077)
    root=Path.home()/'.config/growthcast/portal-staging/recovery-keys'
    migrated=[]; unused=0
    with tempfile.TemporaryDirectory(prefix='growthcast-managed-key-migration-') as directory:
        folder=Path(directory);download=folder/'download';download.mkdir(mode=0o700)
        provision_sessions(folder)
        managed=ManagedKeys(folder,IMAGE,run,success)
        def scoped(role,*command):
            return run(['docker','run','--rm','-v',str(folder/role)+':/credentials:ro',
                '-v',str(download)+':/download','-v',str(managed.material)+':/material',
                '-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*command])
        for legacy in sorted(root.iterdir()):
            if not legacy.is_dir() or not (legacy/'key').exists(): continue
            assert re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9-]{36}',legacy.name)
            assert not legacy.is_symlink() and not (legacy/'key').is_symlink()
            archive='staging/'+legacy.name+'/backup.gcb'
            if not (legacy/'receipt.json').exists():
                inventory=admin('s3api','list-object-versions','--bucket',BUCKET,'--prefix','staging/'+legacy.name+'/')
                assert not inventory.get('Versions') and not inventory.get('DeleteMarkers'), 'Unreceipted archive requires review'
                (legacy/'key').unlink();unused+=1
                continue
            receipt=json.loads((legacy/'receipt.json').read_text())
            assert receipt['bucket']==BUCKET and receipt['key']==archive
            key=(legacy/'key').read_bytes();assert len(key)==32
            success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',archive,
                           '--version-id',receipt['versionId'],'/download/backup.gcb'))
            assert hashlib.sha256((download/'backup.gcb').read_bytes()).hexdigest()==receipt['sha256']
            # Authenticate the existing archive with its original key offline before moving that key.
            code='''const f=require("fs"),c=require("crypto");let k=[];process.stdin.on("data",v=>k.push(v));process.stdin.on("end",()=>{const b=f.readFileSync("/download/backup.gcb"),key=Buffer.concat(k);if(b.subarray(0,8).toString()!=="GCBACK01"||key.length!==32)process.exit(1);const d=c.createDecipheriv("aes-256-gcm",key,b.subarray(8,20));d.setAAD(Buffer.from("GrowthCast recovery archive v1"));d.setAuthTag(b.subarray(20,36));d.update(b.subarray(36));d.final();});'''
            success(subprocess.run(['docker','run','--rm','-i','--network','none','--entrypoint','node',
                '-v',str(download)+':/download:ro','growthcast-recovery','-e',code],input=key,capture_output=True,check=False))
            envelope_key=archive.removesuffix('backup.gcb')+'key.kms.json'
            envelope=managed.wrap(key,archive)
            (managed.material/'envelope.json').write_text(json.dumps(envelope))
            # Without ListBucket, S3 hides missing objects behind AccessDenied. Use atomic create-only writes.
            uploaded=scoped('upload','s3api','put-object','--bucket',BUCKET,'--key',envelope_key,
                '--body','/material/envelope.json','--if-none-match','*')
            if uploaded.returncode:
                assert b'PreconditionFailed' in uploaded.stderr, 'Unexpected envelope upload failure'
                existing=scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',envelope_key,'/material/returned.json')
                version=json.loads(success(existing))['VersionId']
            else:
                version=json.loads(uploaded.stdout)['VersionId']
                success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',envelope_key,
                               '--version-id',version,'/material/returned.json'))
            envelope=json.loads((managed.material/'returned.json').read_text())
            assert managed.unwrap(envelope,archive)==key
            receipt['managedKey']={'keyArn':managed.arn,'objectKey':envelope_key,'versionId':version}
            receipt['keyEscrow']='KMS context-bound wrapped data key; legacy plaintext removed after verified migration'
            receipt['keyMigratedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
            (legacy/'receipt.tmp').write_text(json.dumps(receipt,indent=2)+'\n')
            (legacy/'receipt.tmp').replace(legacy/'receipt.json')
            (legacy/'key').unlink();del key
            (download/'backup.gcb').unlink()
            migrated.append({'archiveKey':archive,'archiveVersionId':receipt['versionId'],'envelopeVersionId':version})
    assert not any((p/'key').exists() for p in root.iterdir() if p.is_dir()), 'Local archive keys remain'
    report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'migrated':migrated,
        'unusedPreUploadKeysRemoved':unused,'localPlaintextArchiveKeysRemaining':0,
        'checks':['exact-version ciphertext SHA-256 and offline AES-GCM authentication','wrapped envelope exact-version download and KMS unwrap matches original key','atomic receipt update before plaintext-key removal','unused keys removed only after confirming no remote object versions for their unique run prefix']}
    Path(args.receipt).write_text(json.dumps(report,indent=2)+'\n')
    print(f'Migrated {len(migrated)} retained archive keys; no local plaintext archive keys remain.')

if __name__=='__main__': main()
