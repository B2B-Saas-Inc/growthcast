from common import *
source=load(D/'backup/job/configuration.json')['secretArn'];target=load(R/'secret-pins.json')['backup']['arn']
try:
 for name,arn in [('source-backup',source),('target-backup',target)]:
  (PRIVATE/(name+'.json')).write_text(aws('secretsmanager','get-secret-value','--secret-id',arn)['SecretString'])
 r=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(PRIVATE)+':/private:ro','-v',str(D)+':/deployment:ro','-v',str(R/'compare.mjs')+':/compare.mjs:ro',load(R/'images.json')['api'],'/compare.mjs'],capture_output=True,text=True)
 if r.returncode:print(r.stderr[-500:]);raise RuntimeError('Final migration comparison failed')
 save(R/'migration-evidence.json',json.loads(r.stdout));print('All business data and account password hashes match current staging; settings preserved.')
finally:
 for name in ['source-backup','target-backup']:(PRIVATE/(name+'.json')).unlink(missing_ok=True)
