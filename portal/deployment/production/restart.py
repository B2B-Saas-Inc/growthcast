from common import *
c='growthcast-portal-production-api'
before=aws('ecs','list-tasks','--cluster',c,'--service-name',c)['taskArns'];assert len(before)==1
save(R/'restart.json',{'before':before,'status':'running'})
aws('ecs','update-service','--cluster',c,'--service',c,'--force-new-deployment')
print('Production task replacement started with a client session and private file retained.',flush=True)
for _ in range(120):
 s=aws('ecs','describe-services','--cluster',c,'--services',c)['services'][0]
 after=aws('ecs','list-tasks','--cluster',c,'--service-name',c)['taskArns']
 if len(after)==1 and after!=before and len(s['deployments'])==1:
  t=aws('ecs','describe-tasks','--cluster',c,'--tasks',*after)['tasks'][0]
  if t.get('healthStatus')=='HEALTHY':break
 time.sleep(4)
else:raise RuntimeError('Task replacement still pending')
for _ in range(30):
 if aws('ecs','describe-tasks','--cluster',c,'--tasks',*before)['tasks'][0]['lastStatus']=='STOPPED':break
 time.sleep(2)
else:raise RuntimeError('Previous task still draining')
save(R/'restart.json',{'before':before,'after':after,'status':'healthy-replacement','checkedAt':now()})
print('Production replaced task is healthy; checking retained client session and file.',flush=True)
checked(['python3','-B',str(R/'verify-files.py'),'verify-cleanup'])
