import pg from '/boundary/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const ref=process.env.SUPABASE_PROJECT_REF;
if(!['saedetvoolpdysiyjwvg','mdjldxussxdtcjxsoesr'].includes(ref))throw Error('Pinned release target required');
const url=readFileSync('/private/admin-url','utf8').trim();const config=supabaseConnection({url,projectRef:ref,ca:readFileSync('/private/ca.crt','utf8')});config.options='';
const db=new pg.Client(config);
try{await db.connect();if((await db.query('SELECT current_user')).rows[0].current_user!=='postgres')throw Error('Explicit migration administrator required');
 if(process.argv[2]==='enable'){
  if((await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='gc_migrate'")).rows[0].rolcanlogin)throw Error('Migration login already active');
  const password=randomBytes(32).toString('hex');writeFileSync('/private/role-enable-attempted','gc_migrate',{mode:0o600,flag:'wx'});await db.query(`ALTER ROLE gc_migrate LOGIN PASSWORD '${password}' VALID UNTIL '${new Date(Date.now()+15*60000).toISOString()}'`);
  const parsed=new URL(url);parsed.username='gc_migrate.'+ref;parsed.password=password;parsed.search='';writeFileSync('/private/database-url',parsed.href,{mode:0o600,flag:'wx'});
 }else if(process.argv[2]==='disable'){await db.query('ALTER ROLE gc_migrate NOLOGIN PASSWORD NULL');}else throw Error('Unsupported mode');
 console.log('Migration role '+process.argv[2]+' completed');
}catch(e){console.error(JSON.stringify({operation:'migration-role',code:e.code??e.name}));process.exitCode=1;}finally{await db.end();}
