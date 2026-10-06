"""Run complete application regressions with the opt-in secret loss/recovery hooks."""
import datetime,hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
result={'scope':'disposable-local-applications-existing-secrets-through-live-S3-KMS','productionCertificate':False,'sourceStagingWrites':False,'services':{},'result':'in-progress'}
assert not (ROOT/'evidence.json').exists(),'Review prior acceptance evidence before rerunning'
cases=[('atrium','run.sh'),('documenso','signing.sh')]
assert sys.argv[1:] in ([],['--retry-documenso']),'Unsupported acceptance mode'
if sys.argv[1:]==['--retry-documenso']:
    prior=json.loads((ROOT/'failed-acceptance.json').read_text())
    assert prior['failedService']=='documenso' and prior['services']['atrium']['result']=='passed'
    for name,digest in prior['sourceSha256'].items():
        if name!='secret-recovery/accept.py':assert hashlib.sha256((ROOT.parent/name).read_bytes()).hexdigest()==digest,'Reviewed code changed; full rerun required'
    history=ROOT/'attempt-history.json';attempts=json.loads(history.read_text()) if history.exists() else []
    attempts.append({'acceptance':prior,'transfer':json.loads((ROOT/'documenso-transfer-evidence.json').read_text())})
    history.write_text(json.dumps(attempts,indent=2)+'\n');(ROOT/'documenso-transfer-evidence.json').unlink()
    result['services']['atrium']=prior['services']['atrium'];cases=[('documenso','signing.sh')]
try:
    for service,script in cases:
        print('Running '+service+' existing-secret recovery acceptance.',flush=True)
        env={**os.environ,'RUNTIME_SECRET_RECOVERY':'1','RUNTIME_TEST_SERVICE':service,'RUNTIME_MANAGED_STORAGE':'0'}
        process=subprocess.run(['sh',str(ROOT.parent/'runtime/test'/script)],env=env,capture_output=True)
        if process.returncode:
            result['failedService']=service
            # Keep only known result markers, never raw application/browser output.
            result['failureMarkers']=[marker for marker in ['AssertionError','SIGSEGV','TimeoutError','Recovery command failed','Occupied secret target','Disposable runtime project required','Existing'] if marker.encode() in process.stdout+process.stderr]
            raise RuntimeError(service+' regression failed; raw output withheld')
        marker=b'Packaged atrium passed' if service=='atrium' else b'Packaged provider signing passed'
        assert marker in process.stdout
        transfer=json.loads((ROOT/(service+'-transfer-evidence.json')).read_text());assert transfer['result']=='transferred-awaiting-application-acceptance'
        project=transfer['fixtureProject']
        for kind,command in [('containers',['docker','ps','-a','--format','{{.Names}}']),('volumes',['docker','volume','ls','--format','{{.Name}}']),('networks',['docker','network','ls','--format','{{.Name}}'])]:
            entries=subprocess.run(command,capture_output=True,text=True,check=True).stdout.splitlines();assert not any(item.startswith(project+'-') or item.startswith(project+'_') for item in entries),kind+' remain'
        result['services'][service]={'result':'passed','transferEvidence':service+'-transfer-evidence.json','fixtureResourcesRemoved':True,'existingSessionSurvivesRecoveredAuthSecret':service=='atrium','newNativeAndSdkSignaturesUsingRecoveredCertificate':service=='documenso','fourPdfSignaturesVerified':service=='documenso'}
        print(service+' full application recovery acceptance passed; fixture resources removed.',flush=True)
    result['result']='passed'
finally:
    if result['result']!='passed':result['result']='failed'
    result['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    result['sourceSha256']={str(p.relative_to(ROOT.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'accept.py',ROOT/'run.py',ROOT/'bundle.mjs',ROOT.parent/'runtime/test/run.sh',ROOT.parent/'runtime/test/signing.sh']}
    (ROOT/('evidence.json' if result['result']=='passed' else 'failed-acceptance.json')).write_text(json.dumps(result,indent=2)+'\n')
