import pg from '/boundary/node_modules/pg/lib/index.js';
import {readFileSync} from 'node:fs';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const mode=process.argv[2];if(!['enable','disable'].includes(mode))throw Error('Unknown mode');
const config=supabaseConnection({projectRef:'saedetvoolpdysiyjwvg',url:readFileSync('/source/database-url','utf8').trim(),ca:readFileSync('/source/prod-ca-2021.crt','utf8')});config.options='';const db=new pg.Client(config);
try{await db.connect();await db.query('BEGIN');
 const role=(await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='gc_documenso'")).rows[0];
 if(mode==='enable'){
  if(role.rolcanlogin)throw Error('Expected disabled provider');
  if((await db.query('SELECT count(*)::int n FROM gc_documenso."Envelope"')).rows[0].n!==0)throw Error('Provider documents exist; refuse unreviewed job startup');
  await db.query(`ALTER ROLE gc_documenso LOGIN VALID UNTIL '${new Date(Date.now()+20*60000).toISOString()}'`);
 }else await db.query("ALTER ROLE gc_documenso NOLOGIN VALID UNTIL 'infinity'");
 await db.query('COMMIT');console.log(JSON.stringify({role:'gc_documenso',login:mode==='enable',atriumRoleUnchanged:true}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.log(JSON.stringify({error:'Provider role operation failed',code:e.code??e.name}));process.exitCode=1;}finally{await db.end();}
