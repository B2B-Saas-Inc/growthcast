"""Create the requested review accounts without emailing or exposing passwords."""
import datetime,importlib.util,json,os,secrets,subprocess,tempfile
from pathlib import Path
R=Path(__file__).resolve().parent
PRIVATE=Path.home()/'.config/growthcast/portal-staging/review-accounts.json'
assert not PRIVATE.exists() and not (R/'evidence.json').exists(),'Existing review account credentials require reconciliation'
os.umask(0o077)
s=importlib.util.spec_from_file_location('h',R.parent/'proxy-secret/transfer.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
d=json.loads((R.parent/'runtime-connections/deployment.json').read_text());value=h.job.aws('secretsmanager','get-secret-value','--secret-id',d['resources']['AtriumSecretArn'],'--version-id',d['versions']['atrium'])
accounts={'prefix':'review-'+secrets.token_hex(8),'admin':{'email':'ewhite@growthcast.app','password':secrets.token_urlsafe(24)},'client':{'email':'ewhite+client@growthcast.app','password':secrets.token_urlsafe(24)}}
# Save generated login material before mutation so an interrupted response cannot lose access.
PRIVATE.write_text(json.dumps(accounts));PRIVATE.chmod(0o600)
with tempfile.TemporaryDirectory(prefix='growthcast-review-provision-') as directory:
 p=Path(directory);(p/'connection.json').write_text(value['SecretString']);(p/'accounts.json').write_text(json.dumps(accounts));del value
 result=subprocess.run(['docker','run','--rm','--user','0','--entrypoint','/usr/local/bin/bun','-v',str(p)+':/private:ro','-v',str(R/'create.mjs')+':/create.mjs:ro','growthcast-atrium-runtime','/create.mjs'],capture_output=True,text=True)
 assert result.returncode==0,'Review account provisioning failed; generated credentials retained for reconciliation'
 evidence=json.loads(result.stdout);evidence.update(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),adminEmail=accounts['admin']['email'],clientEmail=accounts['client']['email']);(R/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
login=PRIVATE.with_name('review-logins.md')
login.write_text('# GrowthCast portal review logins\n\nURL: https://clients.staging.growthcast.app/login\n\nSign in to Vercel first if the staging protection screen appears. Then use one account below. Sign out of the portal before switching accounts.\n\n## Admin\n\nEmail: '+accounts['admin']['email']+'\n\nPassword: '+accounts['admin']['password']+'\n\nAccess: GrowthCast organization owner; admin dashboard and both review projects.\n\n## Test client\n\nEmail: '+accounts['client']['email']+'\n\nPassword: '+accounts['client']['password']+'\n\nAccess: Only the assigned sample project, Your growth roadmap.\n\nThese are retained staging review accounts. Passwords can be changed in account settings. No invitation or verification email was sent.\n')
login.chmod(0o600)
print('Requested admin and test client accounts created; passwords saved to the protected local review-logins.md file.')
