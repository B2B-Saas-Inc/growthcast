"""Update production backup/restore images while preserving cadence and identities."""
import sys,uuid
import provider as q
p=q.p;OUT=q.OUT
if sys.argv[1]=='update':
 source=(q.P/'deployment/file-library/recovery-release.py').read_text().replace('from release import *','')
 m={**vars(p),'__name__':'production_documents_recovery'};exec(compile(source,str(q.P/'deployment/file-library/recovery-release.py'),'exec'),m);m['production_recovery']()
elif sys.argv[1]=='start':
 rec=p.load(OUT/'before-recovery.json')['outputs'];path=OUT/'documents-execution.json'
 if not path.exists():
  assert not p.aws('stepfunctions','list-executions','--state-machine-arn',rec['StateMachineArn'],'--status-filter','RUNNING')['executions']
  p.save(path,p.aws('stepfunctions','start-execution','--state-machine-arn',rec['StateMachineArn'],'--name','documents-release-'+uuid.uuid4().hex[:12],'--input','{}'))
 p.poll('production','documents')
elif sys.argv[1]=='poll':p.poll('production','documents')
elif sys.argv[1]=='schedule':
 assert p.load(OUT/'documents-verified.json')['status']=='VERIFIED'
 rec=p.load(OUT/'before-recovery.json')['outputs'];before=p.load(OUT/'schedule-before.json');rule=rec['ScheduleArn'].split('/')[-1]
 if before['State']=='ENABLED':p.aws('events','enable-rule','--name',rule)
 state=p.aws('events','describe-rule','--name',rule);assert state['State']==before['State'];p.save(OUT/'schedule-restored.json',{'at':p.c.now(),'state':state['State'],'cadence':state['ScheduleExpression']})
 print('Original production recovery cadence restored')
else:raise ValueError('Unknown operation')
