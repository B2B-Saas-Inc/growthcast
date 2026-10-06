import pg from '/boundary/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const ref='saedetvoolpdysiyjwvg';
const url=readFileSync('/admin/database-url','utf8').trim();
const config=supabaseConnection({url,projectRef:ref,ca:readFileSync('/admin/ca.crt','utf8')});
config.options='';const db=new pg.Client(config);
try { await db.connect();
 const mode=process.argv[2];
 if(mode==='enable') {
  const role=(await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='gc_migrate'")).rows[0];
  if(role.rolcanlogin)throw Error('Migration login unexpectedly active');
  const password=randomBytes(32).toString('hex');
  await db.query(`ALTER ROLE gc_migrate LOGIN PASSWORD '${password}' VALID UNTIL '${new Date(Date.now()+15*60*1000).toISOString()}'`);
  const parsed=new URL(url);parsed.username='gc_migrate.'+ref;parsed.password=password;parsed.search='';
  writeFileSync('/private/database-url',parsed.href,{mode:0o600,flag:'wx'});
 } else if(mode==='disable') {
  await db.query("ALTER ROLE gc_migrate NOLOGIN PASSWORD NULL");
  if((await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='gc_migrate'")).rows[0].rolcanlogin)throw Error('Login still enabled');
 } else throw Error('Unknown mode');
 console.log(JSON.stringify({migrationRole:mode==='enable'?'temporary-login':'nologin',result:'passed'}));
} catch(e) {console.error(JSON.stringify({error:'Migration role control failed',code:e.code??e.name}));process.exitCode=1;} finally {await db.end();}
