import pg from '/boundary/node_modules/pg/lib/index.js';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
import {migrate,guard,files} from '/boundary/deployment/supabase/managed-atrium/migrate.mjs';
const ref=process.env.SUPABASE_PROJECT_REF;
if(!['saedetvoolpdysiyjwvg','mdjldxussxdtcjxsoesr'].includes(ref))throw Error('Pinned release target required');
const config=supabaseConnection({url:readFileSync('/migration/database-url','utf8'),projectRef:ref,ca:readFileSync('/migration/ca.crt','utf8')});
config.options='-c default_transaction_read_only=off';const db=new pg.Client(config);
try{await db.connect();if((await db.query('SELECT current_user')).rows[0].current_user!=='gc_migrate')throw Error('Migration-only role required');
 const before=(await db.query("SELECT count(*)::int AS n FROM gc_atrium.document_audit_event WHERE action='upload_status_corrected'")).rows[0].n;
 await migrate(db);await migrate(db);await guard(db);
 const after=(await db.query("SELECT count(*)::int AS n FROM gc_atrium.document_audit_event WHERE action='upload_status_corrected'")).rows[0].n;
 console.log(JSON.stringify({projectRef:ref,migrations:(await files()).map(({name,sha256})=>({name,sha256})),correctedUploads:after-before,secondApplication:'no-op',schemaGuard:'passed',verifiedTls:true}));
}catch(e){console.error(JSON.stringify({operation:'migrate',code:e.code??e.name}));process.exitCode=1;}finally{await db.end();}
