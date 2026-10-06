"""Refresh current deployment pointers only after both environments pass acceptance."""
from release import *
for env in CONFIG:assert (R/'release'/env/'acceptance.json').exists()
stage=R/'release/staging';prod=R/'release/production'
# Historical acceptance reports stay intact; these files describe the current desired release.
save(D/'backup/orchestration/foundation.json',template(CONFIG['staging']['recovery']))
save(D/'backup/current-release.json',load(stage/'library-recovery.json'))
s=load(stage/'api.json');save(D/'https-ingress/foundation.json',s['template'])
x=load(D/'https-ingress/deployment.json');x.update(resources=s['outputs'],checkedAt=c.now(),status='UPDATE_COMPLETE');save(D/'https-ingress/deployment.json',x)
x=load(D/'cloud-account/package-images.json');x['atrium']=load(stage/'images.json')['api'];save(D/'cloud-account/package-images.json',x)
x=load(D/'web-app/deployment.json');x.update(load(stage/'web.json'));x['alias']=CONFIG['staging']['host'];save(D/'web-app/deployment.json',x)
s=load(prod/'api.json');save(D/'production/api-foundation.json',s['template']);save(D/'production/api-resources.json',s['outputs'])
x=load(D/'production/images.json');x.update(load(prod/'images.json'));save(D/'production/images.json',x)
save(D/'production/recovery-tasks.json',load(prod/'recovery-tasks.json'));save(D/'production/recovery-foundation.json',template(CONFIG['production']['recovery']))
save(D/'production/web-deployment.json',load(prod/'web.json'));save(D/'production/web-source.json',load(prod/'web-source.json'))
save(R/'release/current.json',{'recordedAt':c.now(),'staging':load(stage/'acceptance.json'),'production':load(prod/'acceptance.json'),'applicationCommit':'0e8d8bb5396a6fcdd1f8ebe566b1efc79c48e3d2','guestDocumentCandidateDeployed':False,'existingAccountPasswordsChanged':False})
print('Current deployment pointers updated; historical acceptance evidence retained')
