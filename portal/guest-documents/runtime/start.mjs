import http from 'node:http';
import pg from 'pg';
import {readConfiguration,readSharedConfiguration,readDeliveryConfiguration} from './config.mjs';
import {verifyRuntime} from '../../deployment/runtime/config.mjs';
import {guard} from '../../deployment/supabase/managed-atrium/migrate.mjs';
import {createGuestServices} from '../application.mjs';
import {managedDeliveryFactory} from '../signing/managed-delivery.mjs';
import {startDeliveryWorker} from '../signing/worker.mjs';
import {staffBoundary} from './boundary.mjs';
let pool,worker;
try {
 const mode=process.env.GC_DOCUMENT_DELIVERY;
 if(mode!==undefined&&mode!=='disabled'&&mode!=='staging-verified')throw Error('Unknown delivery mode');
 const deliveryEnabled=mode==='staging-verified';
 const {database,application}=process.env.GC_GUEST_SHARED_RUNTIME==='1'?readSharedConfiguration():readConfiguration();
 await verifyRuntime(new pg.Client(database.config),database.expected,async db=>{
  await guard(db);
  const {rows}=await db.query("SELECT name FROM portal_meta.migrations WHERE name='012-catalog-restore-stable.sql'");
  if(rows.length!==1)throw Error('Guest migration required');
  if(deliveryEnabled&&(await db.query("SELECT name FROM portal_meta.migrations WHERE name='013-document-delivery.sql'")).rowCount!==1)throw Error('Delivery migration required');
 });
 pool=new pg.Pool({...database.config,max:4});
 const {handler,delivery}=createGuestServices({pool,...application,logo:Buffer.alloc(0),createDelivery:deliveryEnabled?managedDeliveryFactory(readDeliveryConfiguration()):undefined});
 const boundary=staffBoundary({handler,...application,deliveryEnabled});
 const server=http.createServer((req,res)=>{if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ready":true}');return;}return boundary(req,res);});
 server.headersTimeout=10000;server.requestTimeout=30000;server.keepAliveTimeout=5000;server.maxConnections=8;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3002,'0.0.0.0',resolve);});
 if(delivery)worker=startDeliveryWorker({delivery,onFailure:message=>console.error(message)});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{const drained=worker?.stop();server.close(()=>{void Promise.resolve(drained).then(()=>pool.end());});server.closeIdleConnections();setTimeout(()=>process.exit(1),delivery?110000:10000).unref();});
 console.log(delivery?'Staging staff document service listening; configured delivery worker enabled.':'Staging staff document service listening; delivery routes disabled.');
}catch{await worker?.stop();await pool?.end().catch(()=>{});console.error('Guest runtime startup refused; details suppressed');process.exitCode=1;}
