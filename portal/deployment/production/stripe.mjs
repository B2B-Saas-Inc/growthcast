import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import Stripe from '/upstream/apps/api/node_modules/stripe/esm/stripe.esm.node.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
import {SettingsService} from '/upstream/apps/api/dist/settings/settings.service.js';
const c=JSON.parse(readFileSync('/private/connection.json')),identity=JSON.parse(readFileSync('/private/identity.json'));
assert.equal(c.projectRef,'mdjldxussxdtcjxsoesr');const config=supabaseConnection({url:c.databaseUrl,projectRef:c.projectRef,ca:c.databaseCa});config.options='';const db=new pg.Client(config);
const settings=new SettingsService({},{getOrThrow:()=>identity.runtime.secrets.BETTER_AUTH_SECRET},{warn:()=>{}});
let created,stripe;
try{
 await db.connect();const rows=(await db.query('SELECT id,"organizationId","stripeSecretKey","stripeWebhookSecret" FROM gc_atrium.system_settings WHERE "stripeSecretKey" IS NOT NULL')).rows;assert.equal(rows.length,1);const row=rows[0];
 stripe=new Stripe(settings.decrypt(row.stripeSecretKey),{timeout:15000,maxNetworkRetries:0});const account=await stripe.accounts.retrieve();assert(account.charges_enabled);
 const url='https://clients.growthcast.app/api/payments/webhook/'+row.organizationId;
 if(process.argv[2]==='configure'){
  const endpoints=await stripe.webhookEndpoints.list({limit:100});assert(!endpoints.has_more);assert(!endpoints.data.some(e=>e.url===url),'Existing production endpoint needs reconciliation');
  created=await stripe.webhookEndpoints.create({url,enabled_events:['checkout.session.completed','checkout.session.expired'],description:'GrowthCast production client portal'});assert(created.secret);
  await db.query('UPDATE gc_atrium.system_settings SET "stripeWebhookSecret"=$1 WHERE id=$2',[settings.encrypt(created.secret),row.id]);
  const receipt={endpointId:created.id,url,events:created.enabled_events,status:created.status,chargesCreated:0,stagingEndpointUnchanged:true,independentWebhookSecret:true};created=undefined;console.log(JSON.stringify(receipt));
 }else if(process.argv[2]==='verify'){
  const secret=settings.decrypt(row.stripeWebhookSecret),payload=JSON.stringify({id:'evt_growthcast_production_boundary_check',object:'event',type:'growthcast.acceptance.noop',livemode:true,data:{object:{}}});
  const signature=stripe.webhooks.generateTestHeaderString({payload,secret});stripe.webhooks.constructEvent(payload,signature,secret);const bypass=readFileSync('/private/vercel-bypass','utf8');
  const call=sig=>fetch(url,{method:'POST',headers:{'content-type':'application/json','stripe-signature':sig,'x-vercel-protection-bypass':bypass},body:payload});
  const invalid=await call('t=1,v1=invalid');assert.equal(invalid.status,400);
  const good=await call(signature);assert.equal(good.status,201);console.log(JSON.stringify({signatureAccepted:true,invalidSignatureDenied:true,noBrowserOriginRequired:true,noPaymentCreated:true,stagingEndpointUnchanged:true}));
 }else throw Error('Unknown operation');
}catch(e){if(created&&stripe)await stripe.webhookEndpoints.del(created.id);console.error(JSON.stringify({stage:'stripe-config-failed',name:e.name,code:e.code,statusCode:e.statusCode}));process.exitCode=1}finally{await db.end()}
