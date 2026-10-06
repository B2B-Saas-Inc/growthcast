// Runs inside the application image with only that service's existing mounts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runtimeConfig,verifyRuntime} from '/boundary/deployment/runtime/config.mjs';
import {guard as atriumGuard} from '/boundary/deployment/supabase/managed-atrium/migrate.mjs';
import {guard as providerGuard} from '/boundary/deployment/supabase/managed-documenso/migrate.mjs';
const require=createRequire('/boundary/package.json');
const pg=require('pg');
let stage='config';
try {
 const caPath='/run/secrets/database-ca.crt';
 const {config,expected}=runtimeConfig({service:process.env.GC_SERVICE,projectRef:process.env.SUPABASE_PROJECT_REF,url:readFileSync('/run/secrets/database-url','utf8'),ca:readFileSync(caPath,'utf8'),caPath});
 stage='runtime-boundary';
 const client=new pg.Client(config);const query=client.query.bind(client);client.query=async (...args)=>{const result=await query(...args);if(typeof args[0]==='string'&&args[0].includes('current_user AS role'))console.log(JSON.stringify({boundaryStatus:result.rows[0]}));return result;};
 await verifyRuntime(client,expected,async db=>{stage='schema-guard';await (process.env.GC_SERVICE==='atrium'?atriumGuard:providerGuard)(db);await assert.rejects(db.query(process.env.GC_SERVICE==='atrium'?'DELETE FROM gc_atrium."user" WHERE false':'DELETE FROM gc_documenso."User" WHERE false'),{code:'25006'});});
 console.log(JSON.stringify({stage:'packaged-preflight',passed:true,readOnlyWriteDenial:true}));
} catch(e) {
 const allowed=['Runtime database boundary mismatch','Schema version/checksum mismatch','Schema drift','Migration checksum mismatch'];
 console.log(JSON.stringify({stage,passed:false,code:/^[A-Z0-9_]{3,40}$/.test(e.code??'')?e.code:undefined,check:allowed.includes(e.message)?e.message:undefined}));
 process.exitCode=1;
}
