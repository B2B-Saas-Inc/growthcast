import {readFileSync} from 'node:fs';
try{
 const {deliver}=await import('/boundary/deployment/runtime-secrets/deliver.mjs');
 const r=await deliver({service:'atrium'});console.log('runtime-delivered');
 const {deliverConnections}=await import('/boundary/deployment/runtime-connections/deliver.mjs');
 const c=await deliverConnections({service:'atrium'});console.log('connection-delivered');
 const {runtimeConfig,verifyRuntime}=await import('/boundary/deployment/runtime/config.mjs');
 const pg=await import('/boundary/node_modules/pg/lib/index.js');
 const {guard}=await import('/boundary/deployment/supabase/managed-atrium/migrate.mjs');
 const config=runtimeConfig({service:'atrium',projectRef:'mdjldxussxdtcjxsoesr',url:readFileSync(c.directory+'/database-url','utf8'),ca:readFileSync(c.directory+'/database-ca.crt','utf8'),caPath:c.directory+'/database-ca.crt'});
 await verifyRuntime(new pg.default.Client(config.config),config.expected,guard);console.log('guard-passed');
}catch(e){console.log(JSON.stringify({stage:'diagnostic-failed',name:e.name,code:e.code,message:['Runtime delivery identity refused','ECS task credentials required','Runtime secret delivery refused','Runtime connection delivery refused','Runtime database boundary mismatch'].includes(e.message)?e.message:undefined}));process.exitCode=1}
