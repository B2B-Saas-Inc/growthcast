"""Independent inventory for every recorded secret-recovery fixture and attempt."""
import datetime,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
projects=set()
def visit(value):
    if isinstance(value,dict):
        if 'fixtureProject' in value:projects.add(value['fixtureProject'])
        for item in value.values():visit(item)
    elif isinstance(value,list):
        for item in value:visit(item)
for path in ROOT.glob('*.json'):visit(json.loads(path.read_text()))
assert projects,'Recorded fixtures required'
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fixtureProjectsChecked':len(projects)}
for kind,command in [('containers',['docker','ps','-a','--format','{{.Names}}']),('volumes',['docker','volume','ls','--format','{{.Name}}']),('networks',['docker','network','ls','--format','{{.Name}}'])]:
    names=subprocess.run(command,capture_output=True,text=True,check=True).stdout.splitlines()
    remaining=[name for name in names if name.startswith('growthcast-secret-recovery-') or any(name.startswith(project+'-') or name.startswith(project+'_') for project in projects)]
    assert not remaining,'Secret recovery '+kind+' remain'
    result[kind+'Remaining']=0
(ROOT/'cleanup-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print('All recorded secret-recovery fixtures and plaintext archive/key volumes are removed.')
