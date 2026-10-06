// Explicit release operation; never run by application startup.
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '../../deployment/supabase-config.mjs';
import {migrate,guard,files} from '../../deployment/supabase/managed-atrium/migrate.mjs';
const projectRef='saedetvoolpdysiyjwvg';
const config=supabaseConnection({projectRef,url:readFileSync('/migration/database-url','utf8'),ca:readFileSync('/migration/ca.crt','utf8')});
config.options='-c default_transaction_read_only=off';
const db=new pg.Client(config);
try{
 await db.connect();
 if((await db.query('SELECT current_user')).rows[0].current_user!=='gc_migrate')throw Error('Migration-only role required');
 if((await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl!==true)throw Error('TLS required');
 const expected=Number(process.env.GC_EXPECTED_MIGRATIONS??13);
 if(![10,11,12,13].includes(expected)||(await files()).length!==expected)throw Error('Candidate manifest required');
 await migrate(db);await migrate(db);await guard(db);
 console.log(JSON.stringify({projectRef,migrations:(await files()).map(({name,sha256})=>({name,sha256})),secondApplication:'no-op',schemaGuard:'passed',verifiedTls:true}));
}catch(e){console.error(JSON.stringify({operation:'migrate',code:e.code??e.name}));process.exitCode=1;}finally{await db.end();}
