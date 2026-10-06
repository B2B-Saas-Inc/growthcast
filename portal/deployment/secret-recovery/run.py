"""Off-host recovery of secrets belonging only to stopped disposable local fixtures."""
import argparse,datetime,hashlib,json,os,re,subprocess,sys,tempfile,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'offhost'))
from roundtrip import provision_sessions,run,success,IMAGE,BUCKET
from managed_keys import ManagedKeys

def main():
    parser=argparse.ArgumentParser();parser.add_argument('service',choices=['atrium','documenso']);parser.add_argument('project');args=parser.parse_args()
    prefix='growthcast-runtime' if args.service=='atrium' else 'growthcast-runtime-signing'
    assert re.fullmatch(prefix+r'-[0-9]+-[0-9]+',args.project),'Disposable runtime project required'
    os.umask(0o077)
    record_path=ROOT/(args.service+'-transfer-evidence.json');assert not record_path.exists(),'Archive previous transfer evidence explicitly before rerunning'
    app=args.project+('_runtime' if args.service=='atrium' else '_provider-secrets')
    auxiliary=args.project+('_origin' if args.service=='atrium' else '_runtime')
    for volume in [app,auxiliary]:
        metadata=json.loads(success(run(['docker','volume','inspect',volume])))[0]
        assert metadata['Labels']['com.docker.compose.project']==args.project
    active=success(run(['docker','ps','--filter','label=com.docker.compose.project='+args.project,'--format','{{.Label "com.docker.compose.service"}}'])).decode().splitlines()
    assert not set(active)&({'provider'} if args.service=='atrium' else {'documenso','gateway','sdk'}),'Secret consumers must be stopped'
    tag='growthcast-secret-recovery-'+uuid.uuid4().hex
    volumes={k:tag+'-'+k for k in ['snapshot','key','encrypted','restored']}
    receipt={'service':args.service,'fixtureProject':args.project,'scope':'synthetic-secrets-only','result':'in-progress'}
    def local(script,*arguments):
        return success(run(['docker','run','--rm','--user','root','--network','none','--entrypoint','node','-v',app+':/application','-v',auxiliary+':/auxiliary','-v',str(ROOT)+':/fixture:ro',*[item for k,v in volumes.items() for item in ['-v',v+':/'+k]],'growthcast-recovery',script,*arguments]))
    try:
        for volume in volumes.values():success(run(['docker','volume','create',volume]))
        receipt['capture']=json.loads(local('/fixture/bundle.mjs',args.service,'capture'))
        local('archive.mjs','key');local('archive.mjs','encrypt')
        key=local('-e','process.stdout.write(require("fs").readFileSync("/key/key"))');assert len(key)==32
        before=json.loads(local('-e','const f=require("fs"),c=require("crypto"),b=f.readFileSync("/encrypted/backup.gcb");console.log(JSON.stringify({sha256:c.createHash("sha256").update(b).digest("hex"),bytes:b.length}));'))
        object_key='staging/runtime-secrets-'+args.service+'-'+uuid.uuid4().hex+'/backup.gcb'
        with tempfile.TemporaryDirectory(prefix='growthcast-secret-recovery-') as directory:
            folder=Path(directory);provision_sessions(folder);managed=ManagedKeys(folder,IMAGE,run,success)
            envelope=managed.wrap(key,object_key);del key
            managed.verify_denials(envelope,object_key)
            (managed.material/'envelope.json').write_text(json.dumps(envelope))
            def scoped(role,*command):return run(['docker','run','--rm','-v',str(folder/role)+':/credentials:ro','-v',str(managed.material)+':/material','-v',volumes['encrypted']+':/archive','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*command])
            envelope_key=object_key.removesuffix('backup.gcb')+'key.kms.json'
            key_version=json.loads(success(scoped('upload','s3api','put-object','--bucket',BUCKET,'--key',envelope_key,'--body','/material/envelope.json','--if-none-match','*')))['VersionId']
            put=['s3api','put-object','--bucket',BUCKET,'--key',object_key,'--body','/archive/backup.gcb','--if-none-match','*']
            archive_version=json.loads(success(scoped('upload',*put)))['VersionId']
            denied=scoped('upload',*put);assert denied.returncode!=0 and b'PreconditionFailed' in denied.stderr
            receipt.update({'bucket':BUCKET,'key':object_key,'versionId':archive_version,**before,'managedKey':{'keyArn':managed.arn,'objectKey':envelope_key,'versionId':key_version}})
            # Persist a secret-free recovery locator before simulating loss.
            record_path.write_text(json.dumps(receipt,indent=2)+'\n')
            local('/fixture/bundle.mjs',args.service,'erase')
            (managed.material/'envelope.json').unlink();(managed.material/'cipher.bin').unlink(missing_ok=True)
            success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',object_key,'--version-id',archive_version,'/archive/backup.gcb'))
            success(scoped('restore','s3api','get-object','--bucket',BUCKET,'--key',envelope_key,'--version-id',key_version,'/material/recovered-envelope.json'))
            recovered=managed.unwrap(json.loads((managed.material/'recovered-envelope.json').read_text()),object_key)
            success(subprocess.run(['docker','run','--rm','--user','root','--network','none','-i','--entrypoint','node','-v',volumes['key']+':/key','growthcast-recovery','-e','const f=require("fs"),b=f.readFileSync(0);if(b.length!==32)throw Error("Invalid key");f.writeFileSync("/key/key",b,{flag:"wx",mode:0o444});'],input=recovered,capture_output=True));del recovered
            after=json.loads(local('-e','const f=require("fs"),c=require("crypto"),b=f.readFileSync("/encrypted/backup.gcb");console.log(JSON.stringify({sha256:c.createHash("sha256").update(b).digest("hex"),bytes:b.length}));'));assert after==before
            local('archive.mjs','decrypt')
            receipt['restored']=json.loads(local('/fixture/bundle.mjs',args.service,'restore'))
            receipt.update({'originalSecretsAndPlaintextRemovedBeforeRetrieval':True,'exactS3Versions':True,'kmsScopeAndTamperDenials':True,'archiveTamperAndWrongKeyDenied':True,'duplicateUploadDenied':True,'result':'transferred-awaiting-application-acceptance'})
    finally:
        for volume in volumes.values():success(run(['docker','volume','rm',volume]))
        receipt['temporaryArchiveVolumesRemoved']=True;receipt['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        receipt['sourceSha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'run.py',ROOT/'bundle.mjs']}
        record_path.write_text(json.dumps(receipt,indent=2)+'\n')
    print(args.service+' existing test secrets recovered byte-for-byte through exact-version S3 and context-bound KMS; application acceptance still required.')
if __name__=='__main__':main()
