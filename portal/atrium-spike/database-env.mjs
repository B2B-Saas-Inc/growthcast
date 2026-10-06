import {readFileSync} from 'node:fs';
import {createStore} from '../../gateway/src/store.mjs';
import {guard} from '../../gateway/foundation/migrate.mjs';
import {spawn} from 'node:child_process';
const url=new URL(process.env.DATABASE_URL);
const application=process.env.DB_ROLE==='application';
const gateway=process.env.DB_ROLE==='gateway';
const worker=process.env.DB_ROLE==='lifecycle';
if(url.hostname!=='database'||url.pathname!=='/atrium_test'||url.username!==(worker?'gc_lifecycle':gateway?'gc_gateway':application?'gc_app':'postgres'))throw Error('Disposable database identity required');
url.password=readFileSync(worker?'/worker-credentials/password':gateway?'/gateway-credentials/password':application?'/app-credentials/password':'/credentials/owner-password','utf8').trim();
url.searchParams.set('sslmode','require');url.searchParams.set('sslaccept','strict');url.searchParams.set('sslcert','/ca/server.crt');
const store=createStore(url.href);
try {await guard(store.pool);} finally {await store.pool.end();}
const child=spawn(process.argv[2],process.argv.slice(3),{env:{...process.env,DATABASE_URL:url.href},stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
