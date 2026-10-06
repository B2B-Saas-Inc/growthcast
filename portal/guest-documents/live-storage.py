"""Run the real connector fixture with only staging Storage credentials; never a cloud DB connection."""
import importlib.util,json,os,subprocess,tempfile,uuid,shutil
from pathlib import Path
R=Path(__file__).resolve().parent;D=R.parent/'deployment'
spec=importlib.util.spec_from_file_location('aws',D/'phase-2-closeout/aws.py');aws=importlib.util.module_from_spec(spec);spec.loader.exec_module(aws)
os.umask(0o077)
pin=json.loads((D/'runtime-connections/pins.json').read_text())['atrium']
assert ':growthcast/portal/staging/' in pin['arn']
c=json.loads(aws.aws('secretsmanager','get-secret-value','--secret-id',pin['arn'],'--version-id',pin['version'])['SecretString'])
assert c['projectRef']=='saedetvoolpdysiyjwvg'
private=Path(tempfile.mkdtemp(prefix='growthcast-guest-connector-'));storage=c['storage'];storage['testKey']='guest-connector-test/'+str(uuid.uuid4())+'.pdf'
(private/'storage.json').write_text(json.dumps(storage));del c,storage
try:
 result=subprocess.run(['sh',str(R/'integration-run.sh')],env={**os.environ,'GUEST_CONNECTOR_INPUT':str(private)},stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 if result.returncode:
  # Only synthetic local identities can appear in this fixture; keep details outside source publication.
  Path('/tmp/growthcast-guest-live-connector.log').write_bytes(result.stdout)
  raise RuntimeError('Connector fixture failed; inspect bounded local diagnostics')
 print('Real Better Auth and staging private-storage connector checks passed.')
finally:
 cleanup=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','node','-v',str(private)+':/connector:ro','-v',str(R)+':/foundation/guest:ro','-v',str(D/'storage')+':/foundation/storage:ro','growthcast-foundation','/foundation/guest/storage-cleanup.mjs'],capture_output=True)
 if cleanup.returncode:raise RuntimeError('Exact-object cleanup needs reconciliation; protected credentials retained at '+str(private))
 shutil.rmtree(private)
 print('Synthetic staging object deletion rechecked; temporary Storage credentials removed.')
