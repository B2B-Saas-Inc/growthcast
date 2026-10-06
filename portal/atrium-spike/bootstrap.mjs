import pg from '../../gateway/node_modules/pg/lib/index.js';
import {readFileSync} from 'node:fs';
import {migrate,guard} from '/app/gateway/foundation/migrate.mjs';
const ssl={ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true};
const password=path=>{const value=readFileSync(path,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(value))throw Error('Generated credential required');return value;};
const config={host:'database',database:'atrium_test',ssl,connectionTimeoutMillis:3000};
const admin=new pg.Client({...config,user:'postgres',password:password('/credentials/owner-password')});
await admin.connect();
try {
 if((await admin.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount)throw Error('Fresh disposable database required');
 for(const [role,path] of Object.entries({gc_migrate:'/migration-credentials/password',gc_app:'/app-credentials/password',gc_lifecycle:'/worker-credentials/password',gc_gateway:'/gateway-credentials/password'}))
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password(path)}'`);
 await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 await admin.query('ALTER SCHEMA public OWNER TO gc_migrate');
 await admin.query('CREATE SCHEMA portal_meta AUTHORIZATION gc_migrate');
 await admin.query('GRANT CONNECT, CREATE ON DATABASE atrium_test TO gc_migrate');
} finally {await admin.end();}
const migration=new pg.Client({...config,user:'gc_migrate',password:password('/migration-credentials/password')});
await migration.connect();
try {await migrate(migration);await migrate(migration);await guard(migration);}finally {await migration.end();}
console.log('Reviewed versioned migrations applied over verified TLS by the separate migration identity.');
