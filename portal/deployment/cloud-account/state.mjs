import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {supabaseConnection} from '../supabase-config.mjs';
import {StorageClient} from '../storage/client.mjs';
let db;
try {
 db=new pg.Client(supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')}));await db.connect();await db.query('BEGIN READ ONLY');
 const roles=await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname IN ('gc_app','gc_documenso','gc_gateway','gc_lifecycle','gc_migrate','gc_documenso_migrate')");
 if(roles.rows.length!==6 || roles.rows.some(r=>r.rolcanlogin))throw Error('Enabled application role');
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='gc_atrium' ORDER BY tablename")).rows;
 const digests={};
 for(const {tablename} of tables){if(!/^[A-Za-z0-9_]+$/.test(tablename))throw Error('Table name refused');const {rows}=await db.query(`SELECT row_to_json(t)::text AS row FROM gc_atrium."${tablename}" t`);const data=rows.map(r=>r.row).sort();digests[tablename]={rows:data.length,sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};}
 await db.query('ROLLBACK');
 const prefix=process.env.FIXTURE_PREFIX;
 if(prefix){if(!/^cloud-[a-f0-9]{16}$/.test(prefix))throw Error('Fixture prefix refused');const credentials=JSON.parse(readFileSync('/source/backup-storage-credentials.json','utf8'));const client=new StorageClient({...credentials,credentials});
  for(const suffix of ['-project','-unassigned']){const response=await client.call('/storage/v1/object/list/'+client.bucket,{method:'POST',headers:{...await client.headers(),'content-type':'application/json'},body:JSON.stringify({prefix:prefix+'-org/'+prefix+suffix,limit:100})});if(!response.ok || (await response.json()).length!==0)throw Error('Fixture storage not empty');}
 }
 console.log(JSON.stringify({schema:'gc_atrium',digests,allSixRolesDisabled:true,fixtureStorageEmpty:!!prefix}));
}catch{console.error('Independent fixture state audit failed; details suppressed');process.exitCode=1;}
finally{await db?.end();}
