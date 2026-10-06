"""Exercise existing packaged APIs on a temporary replacement, never source staging."""
import hashlib,json,re,secrets,subprocess,urllib.parse,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
NODE='node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf'

def verify_applications(settings,folder,ca,container,evidence=None):
    assert settings['projectRef']!='saedetvoolpdysiyjwvg' and settings['intent']=='temporary-replacement-recovery'
    project='growthcast-recovered-apps-'+uuid.uuid4().hex[:12]
    result={'projectRef':settings['projectRef'],'syntheticApplicationSecrets':True,'productionSigningNotTested':True}
    if evidence is not None:evidence['applications']=result
    settings['runtimePasswords']={role:secrets.token_hex(32) for role in ['gc_app','gc_documenso']}
    def mounted(name,files):
        directory=folder/name;directory.mkdir(mode=0o755);directory.chmod(0o755)
        for key,value in files.items():
            path=directory/key;path.write_text(value);path.chmod(0o444)
        return str(directory)
    base=urllib.parse.urlsplit(settings['databaseUrl'])
    common={'NODE_ENV':'production','PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}
    atrium={**common,'PORT':'3001','BETTER_AUTH_SECRET':secrets.token_hex(32),'WEB_URL':'https://portal.growthcast.invalid','API_URL':'https://api.growthcast.invalid','SECURE_COOKIES':'true','ALLOW_SIGNUPS':'false','BILLING_ENABLED':'false','STORAGE_PROVIDER':'supabase','PORTAL_STORAGE_PROJECT_REF':settings['projectRef'],'PORTAL_STORAGE_BUCKET':'gc-atrium-private','SENTRY_ENABLED':'false','LOG_LEVEL':'silent','PORTAL_MAIL_MODE':'capture'}
    documenso={**common,'HOSTNAME':'0.0.0.0','PORT':'3000','NEXTAUTH_SECRET':secrets.token_hex(32),'NEXT_PRIVATE_ENCRYPTION_KEY':secrets.token_hex(32),'NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY':secrets.token_hex(32),'NEXT_PUBLIC_WEBAPP_URL':'https://sign.growthcast.invalid','NEXT_PRIVATE_INTERNAL_WEBAPP_URL':'http://documenso:3000','NEXT_PUBLIC_UPLOAD_TRANSPORT':'database','NEXT_PRIVATE_JOBS_PROVIDER':'local','NEXT_PUBLIC_DISABLE_SIGNUP':'true','NEXT_PRIVATE_SMTP_TRANSPORT':'smtp-auth','NEXT_PRIVATE_SMTP_HOST':'mail','NEXT_PRIVATE_SMTP_PORT':'1025','NEXT_PRIVATE_SMTP_SECURE':'false','NEXT_PRIVATE_SMTP_FROM_NAME':'Synthetic recovery test','NEXT_PRIVATE_SMTP_FROM_ADDRESS':'test@growthcast.invalid','NEXT_PUBLIC_POSTHOG_KEY':'','NEXT_TELEMETRY_DISABLED':'1','DOCUMENSO_DISABLE_TELEMETRY':'true'}
    origin=mounted('app-origin',{'api-origin':secrets.token_hex(32)})
    storage=mounted('app-storage',{'credentials.json':json.dumps(settings['writer'])})
    services={}
    result['images']={}
    for name,role,env,image,engine,port in [('provider','gc_app',atrium,'growthcast-atrium-runtime','bun',3001),('documenso','gc_documenso',documenso,'growthcast-documenso-runtime','node',3000)]:
        url='postgresql://'+role+'.'+settings['projectRef']+':'+settings['runtimePasswords'][role]+'@'+base.hostname+':5432/postgres?sslmode=verify-full'
        runtime=mounted('app-'+name,{'database-url':url,'database-ca.crt':ca.read_text(),'application-env.json':json.dumps(env)})
        image_id=subprocess.run(['docker','image','inspect',image,'--format','{{.Id}}'],capture_output=True,text=True,check=True).stdout.strip()
        assert image_id.startswith('sha256:') and len(image_id)==71
        result['images'][name]=image_id
        services[name]={'image':image_id,'environment':{'SUPABASE_PROJECT_REF':settings['projectRef']},'volumes':[runtime+':/run/secrets:ro',str(ROOT/'runtime-diagnostic.mjs')+':/diagnostic.mjs:ro'],'networks':['private','egress'],'read_only':True,'tmpfs':['/tmp'],'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'logging':{'driver':'none'},'healthcheck':{'test':['CMD',engine,'-e',f"fetch('http://127.0.0.1:{port}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'interval':'3s','timeout':'10s','retries':60}}
        if name=='provider':services[name]['volumes'] += [origin+':/run/origin:ro',storage+':/run/storage:ro']
    services['mail']={'image':'maildev/maildev:2.0.5@sha256:082ec5ee92266c6e17493998ff1bf1c3eb70604b159fbeeaa435ee777f5cc953','networks':['private'],'cap_drop':['ALL'],'security_opt':['no-new-privileges:true'],'logging':{'driver':'none'},'healthcheck':{'test':['CMD-SHELL','wget -q -O - http://127.0.0.1:1080/healthz || exit 1'],'interval':'2s','retries':30}}
    services['check']={'image':NODE,'entrypoint':['node'],'volumes':[str(ROOT.parent/'runtime/test')+':/fixture:ro','sessions:/evidence',origin+':/run/origin:ro'],'networks':['private'],'profiles':['test']}
    compose=folder/'applications.json';compose.write_text(json.dumps({'services':services,'networks':{'private':{'internal':True},'egress':{}},'volumes':{'sessions':{}}}))
    def call(*args):
        completed=subprocess.run(['docker','compose','-p',project,'-f',str(compose),*args],capture_output=True,timeout=300)
        if completed.returncode:
            # Detached Compose diagnostics contain infrastructure state, not app logs.
            if args[0]=='run' and args[-1]=='/diagnostic.mjs':
                for line in completed.stdout.decode().splitlines():
                    if line.startswith('{'):print('Packaged preflight: '+line,flush=True)
            if args[0]=='up':
                diagnostic=completed.stderr.decode(errors='replace')
                for secret in [*settings['runtimePasswords'].values(),*atrium.values(),*documenso.values(),settings['writer']['password'],settings['databaseUrl']]:
                    if len(secret)>20:diagnostic=diagnostic.replace(secret,'[redacted]')
                diagnostic=re.sub(r'postgres(?:ql)?://[^\s]+','[database-url]',diagnostic)
                print('Detached startup diagnostic: '+diagnostic[-2500:],flush=True)
            raise RuntimeError('Replacement application check failed: '+' '.join(args[:3])+'; sensitive output withheld')
        return completed.stdout
    def check(script,mode=None):call('run','--rm','--no-deps','check','/fixture/'+script,*([mode] if mode else []))
    try:
        container('target.mjs','runtime-enable')
        result['packagedPreflights']={}
        for name,engine in [('provider','bun'),('documenso','node')]:
            output=call('run','--rm','--no-deps','--entrypoint',engine,name,'/diagnostic.mjs')
            result['packagedPreflights'][name]=[json.loads(line) for line in output.decode().splitlines() if line.startswith('{')]
        call('up','-d','--wait','mail')
        call('up','-d','--wait','provider','documenso')
        for name,engine in [('provider','bun'),('documenso','node')]:
            call('exec','-T',name,engine,'-e',"const fs=require('fs');if(process.getuid()===0||fs.existsSync('/target/settings.json')||fs.existsSync('/restored/manifest.json')||fs.existsSync('/admin/password'))process.exit(1);")
        result['nonRootRestrictedMounts']=True
        result['bothPackagedServicesHealthy']=True
        print('Both packaged applications started against restored managed schemas with restricted TLS credentials.',flush=True)
        check('atrium-http.check.mjs');result['privateIngressAndAnonymousDenials']=True
        check('atrium-auth.check.mjs','begin');result['invitedSignupAndVerification']=True
        container('target.mjs','runtime-enroll')
        check('atrium-storage.check.mjs','upload');result['privateManagedFileFlow']=True
        call('up','-d','--no-deps','--force-recreate','--wait','provider','documenso')
        check('atrium-auth.check.mjs','resume');check('atrium-storage.check.mjs','resume')
        result['containerRecreationSessionAndFilePersistence']=True
        container('target.mjs','runtime-unenroll');check('atrium-storage.check.mjs','denied')
        check('atrium-auth.check.mjs','logout');result['membershipRevocationLogoutReplayAndLogin']=True
        print('Restored API account, verification, file persistence, membership revocation and session replay checks passed.',flush=True)
    finally:
        try:call('--profile','test','down','--volumes','--remove-orphans');result['applicationContainersAndVolumesRemoved']=True
        finally:
            result.update(container('target.mjs','runtime-disable'))
            del settings['runtimePasswords']
    result['sourceSha256']={str(p.relative_to(ROOT.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'applications.py',ROOT/'runtime-target.mjs',ROOT/'run.py',ROOT/'target.mjs',ROOT/'runtime-diagnostic.mjs',ROOT.parent/'runtime/config.mjs',ROOT.parent/'runtime/runtime.check.mjs',*sorted((ROOT.parent/'runtime/test').glob('atrium-*.check.mjs'))]}
    return result
