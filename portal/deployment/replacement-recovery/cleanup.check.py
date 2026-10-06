"""Regression: explicitly activate the test profile when removing session volumes."""
import datetime,hashlib,json,subprocess,tempfile,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent
project='growthcast-profile-cleanup-'+uuid.uuid4().hex[:12]
with tempfile.TemporaryDirectory() as folder:
    path=Path(folder)/'compose.json'
    path.write_text(json.dumps({'services':{'check':{'image':'node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf','profiles':['test'],'network_mode':'none','volumes':['sessions:/evidence'],'command':['node','-e','require("fs").writeFileSync("/evidence/probe","synthetic")']}},'volumes':{'sessions':{}}}))
    def compose(*args):
        result=subprocess.run(['docker','compose','-p',project,'-f',str(path),*args],capture_output=True)
        assert result.returncode==0,'Profile cleanup fixture command failed'
    def exists():return subprocess.run(['docker','volume','inspect',project+'_sessions'],capture_output=True).returncode==0
    try:
        compose('run','--rm','--no-deps','check');assert exists()
        compose('down','--volumes','--remove-orphans');assert exists(),'Regression fixture should reproduce omitted-profile volume retention'
        compose('--profile','test','down','--volumes','--remove-orphans');assert not exists()
    finally:compose('--profile','test','down','--volumes','--remove-orphans')
evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'passed','omittedProfileRetainsSessionVolume':True,'explicitTestProfileRemovesSessionVolume':True,'applicationsSha256':hashlib.sha256((ROOT/'applications.py').read_bytes()).hexdigest()}
(ROOT/'cleanup-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
print('Compose test-profile session-volume cleanup regression passed.')
