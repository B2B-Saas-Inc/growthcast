import {readFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {connect} from './db.mjs';
import {guard} from './migrate.mjs';
if(process.env.DB_ROLE!=='gc_app'||existsSync('/provision')||existsSync('/tls/server.key'))throw Error('Application credential boundary required');
const db=connect();
try {await db.connect();await guard(db);} finally {await db.end();}
const url=new URL('postgresql://gc_app@database:5432/foundation_test');
url.password=readFileSync('/credential/password','utf8').trim();
url.searchParams.set('schema','gc_atrium');
url.searchParams.set('sslmode','require');
url.searchParams.set('sslaccept','strict');
url.searchParams.set('sslcert','/ca/server.crt');
const child=spawn(process.argv[2],process.argv.slice(3),{env:{...process.env,DATABASE_URL:url.href},stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
