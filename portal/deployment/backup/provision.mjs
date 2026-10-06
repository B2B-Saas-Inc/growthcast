import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {supabaseConnection} from '../supabase-config.mjs';
const ref='saedetvoolpdysiyjwvg';
let db;let stage='connect';
try {
 const config=supabaseConnection({projectRef:ref,url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')});
 config.options='-c default_transaction_read_only=off';
 db=new pg.Client(config);await db.connect();
 const password=readFileSync('/source/backup-password','utf8').trim();
 if(!/^[a-f0-9]{64}$/.test(password))throw Error('Generated backup credential required');
 const sql=readFileSync(new URL('./provision.sql',import.meta.url),'utf8');
 await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(7814205)');
 stage='permissions';await db.query(sql);
 stage='credential';
 await db.query("SET LOCAL password_encryption='scram-sha-256'");
 await db.query(`ALTER ROLE gc_backup LOGIN PASSWORD '${password}'`);
 await db.query('COMMIT');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),projectRef:ref,role:'gc_backup',permissionSqlSha256:createHash('sha256').update(sql).digest('hex'),storageView:'gc_backup_meta.storage_objects'}));
} catch(error) {console.error('Backup provisioning failed at '+stage+' ('+(error.code??'unknown')+')'+(stage==='permissions'?': '+error.message:''));process.exitCode=1;}
finally {if(db)await db.end();}
