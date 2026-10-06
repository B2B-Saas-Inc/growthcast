"""Remove verified orphaned Library test fixture; release only its stopped recovery lock."""
import json
import release as r
p=r.legacy;out=r.R/'release/production';ref='mdjldxussxdtcjxsoesr'
query=lambda sql,read=True:p.c.supa('/v1/projects/'+ref+'/database/query',{'query':sql,'read_only':read})
assert p.aws('sts','get-caller-identity')['Account']=='059393269249'
sql="""DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM gc_atrium.organization WHERE id='library-50b2118b32b0c3d1-org') THEN RAISE EXCEPTION 'Fixture organization exists'; END IF;
 IF EXISTS(SELECT 1 FROM gc_atrium.project WHERE id='library-50b2118b32b0c3d1-project' AND (name<>'Library release review' OR "organizationId"<>'library-50b2118b32b0c3d1-org')) THEN RAISE EXCEPTION 'Fixture scope mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM gc_atrium.file WHERE "organizationId"='library-50b2118b32b0c3d1-org' AND id NOT IN ('cmuhnxv1x0003le0p1t15yps6','cmuhnxwf80009le0po0luyxrz')) THEN RAISE EXCEPTION 'Unexpected fixture files'; END IF;
 DELETE FROM gc_atrium.project WHERE id='library-50b2118b32b0c3d1-project' AND name='Library release review' AND "organizationId"='library-50b2118b32b0c3d1-org';
END $$;"""
connection=p.connection('production')
program="""import pg from '/boundary/node_modules/pg/lib/index.js';import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';let input='';for await(const chunk of process.stdin)input+=chunk;const {connection:c,sql}=JSON.parse(input);const db=new pg.Client(supabaseConnection({url:c.databaseUrl,projectRef:c.projectRef,ca:c.databaseCa}));try{await db.connect();await db.query(sql);console.log('Exact synthetic cleanup completed');}catch(e){console.error(e.code);process.exitCode=1;}finally{await db.end();}"""
p.checked(['docker','run','--rm','-i','--entrypoint','bun','growthcast-atrium-runtime','-e',program],input=json.dumps({'connection':connection,'sql':sql}).encode())
assert query("SELECT count(*)::int AS n FROM gc_atrium.file WHERE \"organizationId\"='library-50b2118b32b0c3d1-org'")==[{'n':0}]
o=p.load(out/'before-recovery.json')['outputs'];saved=p.load(out/'retained-failure.json')['lock'];owner=saved['owner']['S']
assert p.aws('stepfunctions','describe-execution','--execution-arn',owner)['status']=='FAILED'
assert not p.aws('stepfunctions','list-executions','--state-machine-arn',o['StateMachineArn'],'--status-filter','RUNNING')['executions']
for family in ['growthcast-portal-production-backup','growthcast-portal-production-restore']:
 assert not p.aws('ecs','list-tasks','--cluster','growthcast-portal-production-api','--family',family)['taskArns']
p.aws('dynamodb','delete-item','--table-name',o['LockTable'],'--key',json.dumps({'environment':{'S':'production'}}),'--condition-expression','#owner = :owner','--expression-attribute-names',json.dumps({'#owner':'owner'}),'--expression-attribute-values',json.dumps({':owner':{'S':owner}}))
p.save(out/'fixture-reconciliation.json',{'at':p.c.now(),'exactOrphanedSyntheticProjectRemoved':True,'missingFixtureFiles':2,'customerRecordsChanged':False,'stoppedLockOwner':owner})
print('Orphaned synthetic Library project removed; stopped failed recovery lock released')
