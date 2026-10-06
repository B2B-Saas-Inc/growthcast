"""Restore a retained synthetic archive into a temporary managed project, then remove it."""
import datetime,hashlib,importlib.util,json,os,secrets,shutil,subprocess,sys,tempfile,time,urllib.request,urllib.error,urllib.parse,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE='saedetvoolpdysiyjwvg';ORG='nphtmrwksahmpruxzhzj'
sys.path.insert(0,str(ROOT.parent/'offhost'))
from roundtrip import provision_sessions,run,success,IMAGE,BUCKET
from managed_keys import ManagedKeys

def main(applications=False):
    os.umask(0o077)
    evidence_name='application-evidence.json' if applications else 'evidence.json'
    assert not (ROOT/evidence_name).exists() and not (ROOT/'in-progress.json').exists(),'Existing recovery requires explicit reconciliation'
    token=subprocess.run(['/usr/bin/security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
    def request(url,headers,body=None,method=None):
        req=urllib.request.Request(url,headers=headers,data=json.dumps(body).encode() if body is not None else None,method=method)
        for attempt in range(12):
            try:
                with urllib.request.urlopen(req,timeout=90) as response:
                    raw=response.read();return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                if e.code==429 and attempt<11:
                    delay=min(60,max(15,int(e.headers.get('Retry-After','30'))));print('Management API rate limit; waiting before bounded retry.',flush=True);time.sleep(delay);continue
                raise RuntimeError('Recovery API returned HTTP '+str(e.code)) from None
    management={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
    def api(path,body=None,method=None):return request('https://api.supabase.com'+path,management,body,method)
    assert api('/v1/organizations/'+ORG)['name']=='B2B SaaS Inc.'
    previous=json.loads((ROOT.parent/'backup/job/restore-evidence.json').read_text());assert previous['result']=='passed' and previous['restored']['verifiedObjects']==3
    pointer=next(x for x in previous['taskEvents'] if x['stage']=='UPLOADED');receipt=previous['uploadReceipt'];assert receipt['bucket']==BUCKET
    project_name='growthcast-recovery-drill-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    tag='growthcast-replacement-'+str(uuid.uuid4());volumes={k:tag+'-'+k for k in ['key','encrypted','restored']}
    evidence={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceProject':SOURCE,'archiveReceipt':pointer,'temporaryProjectName':project_name,'sourceWrites':False,'result':'in-progress','archiveVolumes':volumes}
    ref=None
    try:
        for v in volumes.values():success(subprocess.run(['docker','volume','create',v],capture_output=True))
        with tempfile.TemporaryDirectory(prefix='growthcast-replacement-') as directory:
            folder=Path(directory);provision_sessions(folder);managed=ManagedKeys(folder,IMAGE,run,success)
            def scoped(*args):return success(run(['docker','run','--rm','-v',str(folder/'restore')+':/credentials:ro','-v',str(managed.material)+':/material','-v',volumes['encrypted']+':/archive','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*args]))
            scoped('s3api','get-object','--bucket',BUCKET,'--key',pointer['receiptKey'],'--version-id',pointer['receiptVersion'],'/material/receipt.json');assert json.loads((managed.material/'receipt.json').read_text())==receipt
            scoped('s3api','get-object','--bucket',BUCKET,'--key',receipt['key'],'--version-id',receipt['versionId'],'/archive/backup.gcb')
            scoped('s3api','get-object','--bucket',BUCKET,'--key',receipt['managedKey']['objectKey'],'--version-id',receipt['managedKey']['versionId'],'/material/envelope.json')
            key=managed.unwrap(json.loads((managed.material/'envelope.json').read_text()),receipt['key'])
            success(subprocess.run(['docker','run','--rm','--user','root','--network','none','-i','--entrypoint','node','-v',volumes['key']+':/key','growthcast-recovery','-e','const f=require("fs");const b=f.readFileSync(0);if(b.length!==32)throw Error("Invalid key");f.writeFileSync("/key/key",b,{mode:0o444,flag:"wx"})'],input=key,capture_output=True));del key
            proof=json.loads(success(subprocess.run(['docker','run','--rm','--network','none','--entrypoint','node','-v',volumes['encrypted']+':/archive:ro','growthcast-recovery','-e','const f=require("fs"),c=require("crypto"),b=f.readFileSync("/archive/backup.gcb");console.log(JSON.stringify({sha256:c.createHash("sha256").update(b).digest("hex"),bytes:b.length}))'],capture_output=True)));assert proof['sha256']==receipt['sha256'] and proof['bytes']==receipt['bytes']
            success(subprocess.run(['docker','run','--rm','--user','root','--network','none','--entrypoint','node','-v',volumes['key']+':/key:ro','-v',volumes['encrypted']+':/encrypted:ro','-v',volumes['restored']+':/restored','growthcast-recovery','archive.mjs','decrypt'],capture_output=True))
            success(subprocess.run(['docker','run','--rm','--network','none','--entrypoint','sh','-v',volumes['restored']+':/restored','growthcast-managed-recovery','-ec','tar -xf /restored/bundle.tar -C /restored; cd /restored; sha256sum -c SHA256SUMS'],capture_output=True))
            evidence['exactVersionsAndAuthenticatedDecryption']=True;print('Retained three-object archive authenticated and recovered without source access.',flush=True)
            password=secrets.token_urlsafe(48)
            created=api('/v1/projects',{'organization_slug':ORG,'name':project_name,'db_pass':password,'region_selection':{'type':'specific','code':'us-east-1'},'desired_instance_size':'micro'})
            ref=created.get('id') or created['ref'];assert ref!=SOURCE and created['name']==project_name
            evidence['temporaryProjectRef']=ref;(ROOT/'in-progress.json').write_text(json.dumps(evidence,indent=2)+'\n');print('Temporary replacement project created in B2B SaaS Inc.; waiting for readiness.',flush=True)
            for _ in range(90):
                project=api('/v1/projects/'+ref)
                if project['status']=='ACTIVE_HEALTHY':break
                time.sleep(10)
            else:raise RuntimeError('Temporary project readiness timeout')
            api('/v1/projects/'+ref+'/ssl-enforcement',{'requestedConfig':{'database':True}},'PUT')
            api('/v1/projects/'+ref+'/api-keys/legacy?enabled=false',method='PUT')
            signing=api('/v1/projects/'+ref+'/config/auth/signing-keys')['keys']
            if not any(k.get('algorithm')=='ES256' and k.get('status')=='in_use' for k in signing):api('/v1/projects/'+ref+'/config/auth/signing-keys',{'algorithm':'ES256','status':'in_use'})
            legacy=api('/v1/projects/'+ref+'/config/auth/signing-keys/legacy')
            if legacy.get('id'):api('/v1/projects/'+ref+'/config/auth/signing-keys/'+legacy['id'],{'status':'revoked'},'PATCH')
            pool=next(x for x in api('/v1/projects/'+ref+'/config/database/pooler') if x['database_type']=='PRIMARY')
            settings={'intent':'temporary-replacement-recovery','projectRef':ref,'databaseUrl':'postgresql://'+urllib.parse.quote(pool['db_user'],safe='')+':'+urllib.parse.quote(password,safe='')+'@'+pool['db_host']+':5432/postgres?sslmode=verify-full'}
            target=folder/'target';target.mkdir();shutil.copyfile(Path.home()/'.config/growthcast/portal-staging/prod-ca-2021.crt',target/'ca.crt')
            def save():(target/'settings.json').write_text(json.dumps(settings))
            def container(file,action=None,require_success=True):
                snapshot=folder/('target-'+str(uuid.uuid4()));snapshot.mkdir();raw=json.dumps(settings).encode();assert json.loads(raw)==settings
                (snapshot/'settings.json').write_bytes(raw);shutil.copyfile(target/'ca.crt',snapshot/'ca.crt')
                args=['docker','run','--rm','-e','RECOVERY_CONFIG_SHA256='+hashlib.sha256(raw).hexdigest(),'-v',str(ROOT.parent)+':/app/deployment:ro','-v',str(snapshot)+':/target:ro','-v',volumes['restored']+':/restored:ro','growthcast-managed-recovery','/app/deployment/replacement-recovery/'+file]+([action] if action else [])
                result=subprocess.run(args,capture_output=True)
                if require_success:
                    if result.returncode:
                        for line in result.stderr.decode().splitlines():
                            if line.startswith('{'):
                                try:diagnostic=json.loads(line)
                                except ValueError:continue
                                evidence['containerFailure']={k:diagnostic[k] for k in ['stage','code','category','check'] if k in diagnostic}
                        if 'containerFailure' not in evidence:
                            import re
                            raw=result.stderr.decode()
                            evidence['containerFailure']={'category':action,'errorTypes':re.findall(r'(?:TypeError|ReferenceError|SyntaxError|AssertionError|Error): [^\n]{0,180}',raw),'codes':re.findall(r"code: '([A-Z0-9_]+)'",raw),'locations':re.findall(r'file:///app/[^ :]+:[0-9]+:[0-9]+',raw)}
                        raise RuntimeError('Replacement container failed: '+file+' '+str(action)+'; sensitive diagnostics withheld')
                    return json.loads(result.stdout.decode().strip().splitlines()[-1])
                return result
            save();evidence['databaseRestore']=container('target.mjs','restore');print('Private schemas restored into temporary managed target.',flush=True)
            api('/v1/projects/'+ref+'/postgrest',{'db_schema':'portal_api'},'PATCH')
            evidence['databaseVerification']=container('target.mjs','verify')
            denied=container('target.mjs','restore',False);assert denied.returncode!=0;evidence['targetOverwriteDenied']=True
            keys=api('/v1/projects/'+ref+'/api-keys?reveal=true');admin=next(k['api_key'] for k in keys if k['type']=='secret' and k['name']=='default');public=next(k['api_key'] for k in keys if k['type']=='publishable' and k['name']=='default')
            headers={'apikey':admin,'Content-Type':'application/json'};base='https://'+ref+'.supabase.co'
            request(base+'/storage/v1/bucket',headers,{'id':'gc-atrium-private','name':'gc-atrium-private','public':False,'file_size_limit':3145728},'POST')
            for kind,email in [('writer','portal-storage@growthcast.invalid'),('reader','portal-backup-storage@growthcast.invalid')]:
                pw=secrets.token_hex(32);user=request(base+'/auth/v1/admin/users',headers,{'email':email,'password':pw,'email_confirm':True,'app_metadata':{'purpose':'temporary-replacement-recovery'}},'POST')
                settings[kind]={'subject':user['id'],'email':email,'password':pw,'publishableKey':public}
            save()
            try:evidence['storagePolicies']=container('target.mjs','storage-policies')
            except RuntimeError:
                if evidence.get('containerFailure',{}).get('code')!='42501':raise
                writer=str(uuid.UUID(settings['writer']['subject']));reader=str(uuid.UUID(settings['reader']['subject']))
                query="BEGIN; SELECT set_config('growthcast.storage_subject','"+writer+"',true),set_config('growthcast.backup_storage_subject','"+reader+"',true);"+(ROOT.parent/'storage/policy.sql').read_text()+(ROOT.parent/'storage/backup-policy.sql').read_text()+"COMMIT;"
                api('/v1/projects/'+ref+'/database/query',{'query':query,'read_only':False})
                evidence['storagePolicies']=container('target.mjs','storage-check');evidence['storagePolicyProvisioning']='management-sql-after-direct-ownership-denial'
            evidence['storageVerification']=container('storage.mjs')
            access=request(base+'/auth/v1/token?grant_type=password',{'apikey':public,'Content-Type':'application/json'},{'email':settings['reader']['email'],'password':settings['reader']['password']},'POST');settings['readerAccessToken']=access['access_token'];settings['readerExpiresAt']=time.time()*1000+access['expires_in']*1000;save()
            api('/v1/projects/'+ref+'/database/query',{'query':'ALTER POLICY gc_backup_read ON storage.objects USING (false)','read_only':False})
            try:evidence['readerRevocation']=container('storage.mjs','revoked')
            finally:api('/v1/projects/'+ref+'/database/query',{'query':"ALTER POLICY gc_backup_read ON storage.objects USING (bucket_id='gc-atrium-private' AND auth.uid()='"+str(uuid.UUID(settings['reader']['subject']))+"'::uuid)",'read_only':False})
            evidence['readerReinstatement']=container('storage.mjs','read')
            evidence['dataApiSchemas']=api('/v1/projects/'+ref+'/postgrest')['db_schema'];assert evidence['dataApiSchemas']=='portal_api'
            if applications:
                from applications import verify_applications
                evidence['applications']=verify_applications(settings,folder,target/'ca.crt',container,evidence)
            evidence['result']='passed';print('Replacement database, recreated identities, private bucket and restored object boundaries passed.',flush=True)
    finally:
        # Preserve completed checks before potentially delayed cloud cleanup.
        (ROOT/'in-progress.json').write_text(json.dumps(evidence,indent=2)+'\n')
        try:
            if ref:
                current=api('/v1/projects/'+ref);assert ref!=SOURCE and current['name']==project_name and current.get('organization_id',current.get('organization_slug'))==ORG
                api('/v1/projects/'+ref,method='DELETE')
                for _ in range(30):
                    if not any(p.get('id',p.get('ref'))==ref for p in api('/v1/projects')):break
                    time.sleep(5)
                else:raise RuntimeError('Deletion submitted; inventory confirmation still pending')
                evidence['temporaryProjectDeleted']=True
        finally:
            for volume in volumes.values():success(subprocess.run(['docker','volume','rm',volume],capture_output=True))
            evidence['archiveVolumesRemoved']=True;evidence['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
            if evidence['result']!='passed':evidence['result']='failed'
            path=ROOT/evidence_name if evidence['result']=='passed' else ROOT/'failed-attempt.json'
            if path.exists() and path.name=='failed-attempt.json':
                history=ROOT/'attempt-history.json';items=json.loads(history.read_text()) if history.exists() else [];items.append(json.loads(path.read_text()));history.write_text(json.dumps(items,indent=2)+'\n')
            path.write_text(json.dumps(evidence,indent=2)+'\n')
            if ref is None or evidence.get('temporaryProjectDeleted'):(ROOT/'in-progress.json').unlink(missing_ok=True)
            else:(ROOT/'in-progress.json').write_text(json.dumps(evidence,indent=2)+'\n')
        print('Temporary project and local archive volumes removed.',flush=True)
if __name__=='__main__':
    assert sys.argv[1:] in ([],['--applications']),'Unsupported recovery mode'
    main(applications=sys.argv[1:]==['--applications'])
