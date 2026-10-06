"""Read-only inventory after temporary recovery cleanup."""
import datetime,json,subprocess,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE='saedetvoolpdysiyjwvg'
token=subprocess.run(['/usr/bin/security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True).stdout.strip()
request=urllib.request.Request('https://api.supabase.com/v1/projects',headers={'Authorization':'Bearer '+token})
with urllib.request.urlopen(request,timeout=60) as response:projects=json.load(response)
remaining=[p for p in projects if p['name'].startswith('growthcast-recovery-drill-')]
source=next(p for p in projects if p.get('id',p.get('ref'))==SOURCE)
volumes=subprocess.run(['docker','volume','ls','--format','{{.Name}}'],capture_output=True,text=True,check=True).stdout.splitlines()
containers=subprocess.run(['docker','ps','-a','--format','{{.Names}}'],capture_output=True,text=True,check=True).stdout.splitlines()
networks=subprocess.run(['docker','network','ls','--format','{{.Name}}'],capture_output=True,text=True,check=True).stdout.splitlines()
evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'temporaryRecoveryProjects':len(remaining),'temporaryArchiveVolumes':sum(v.startswith('growthcast-replacement-') for v in volumes),'temporaryApplicationVolumes':sum(v.startswith('growthcast-recovered-apps-') for v in volumes),'temporaryApplicationContainers':sum(v.startswith('growthcast-recovered-apps-') for v in containers),'temporaryApplicationNetworks':sum(v.startswith('growthcast-recovered-apps-') for v in networks),'sourceProjectStatus':source['status']}
assert all(value==0 for key,value in evidence.items() if key.startswith('temporary')), 'Temporary recovery resources remain'
assert source['status']=='ACTIVE_HEALTHY'
query=urllib.request.Request('https://api.supabase.com/v1/projects/'+SOURCE+'/database/query/read-only',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps({'query':"SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('gc_migrate','gc_app','gc_gateway','gc_lifecycle','gc_documenso_migrate','gc_documenso') ORDER BY rolname"}).encode())
with urllib.request.urlopen(query,timeout=60) as response:roles=json.load(response)
assert len(roles)==6 and all(not role['rolcanlogin'] for role in roles)
evidence['sourceApplicationAndMigrationLoginsDisabled']=True
(ROOT/'cleanup-audit.json').write_text(json.dumps(evidence,indent=2)+'\n')
print('No temporary recovery projects, archive/application volumes, containers or networks remain; source staging is healthy.')
