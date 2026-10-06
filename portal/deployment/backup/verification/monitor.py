"""Explicit one-off restricted monitor. No archive, database or key access."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent.parent/'offhost'))
from roundtrip import provision_sessions,run,success,IMAGE,BUCKET
from publish import NODE

def main():
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='growthcast-monitor-') as directory:
        folder=Path(directory);provision_sessions(folder,monitor=True)
        def scoped(*args):
            return success(run(['docker','run','--rm','-v',str(folder/'monitor')+':/credentials:ro','-v',str(folder)+':/records','-e','AWS_SHARED_CREDENTIALS_FILE=/credentials','-e','AWS_DEFAULT_REGION=us-east-1',IMAGE,*args]))
        try:
            listing=json.loads(scoped('s3api','list-objects-v2','--bucket',BUCKET,'--prefix','verification/staging/','--max-keys','1000','--no-paginate'))
            assert not listing.get('IsTruncated'),'Monitor inventory exceeds bounded capacity'
            records=[]
            for entry in listing.get('Contents',[]):
                assert entry['Size']<=65536 and entry['Key'].startswith('verification/staging/') and entry['Key'].endswith('.json')
                scoped('s3api','get-object','--bucket',BUCKET,'--key',entry['Key'],'/records/record.json')
                records.append(json.loads((folder/'record.json').read_text()))
            state=json.loads(success(subprocess.run(['docker','run','--rm','-i','--network','none','-v',str(ROOT)+':/checks:ro',NODE,'node','/checks/records.mjs','evaluate'],input=json.dumps(records).encode(),capture_output=True)))
        except Exception:
            state={'healthy':False,'reason':'monitor-read-or-validation-failure','ageHours':None}
        metrics=[{'MetricName':'RecoveryHealthy','Value':int(state['healthy']),'Unit':'Count'}, {'MetricName':'RecoveryMonitorHeartbeat','Value':1,'Unit':'Count'}]
        if state['ageHours'] is not None:metrics.append({'MetricName':'VerifiedBackupAgeHours','Value':state['ageHours'],'Unit':'None'})
        for metric in metrics:metric['Dimensions']=[{'Name':'Environment','Value':'staging'}]
        scoped('cloudwatch','put-metric-data','--namespace','GrowthCast/PortalRecovery','--metric-data',json.dumps(metrics))
    evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':state,'metricsEmitted':True,'scheduled':False,'notificationsEnabled':False}
    (ROOT/'monitor-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
    if not state['healthy']:raise SystemExit(1)

if __name__=='__main__':main()
