import pg from 'pg';
import {readFile} from 'node:fs/promises';
import Stripe from 'stripe';
import {createReceiver,ACCOUNT} from './receiver.mjs';
import {createLedger} from './ledger.mjs';
export async function createRuntime(env=process.env) {
 if(env.PAYMENTS_TEST_ENABLED!=='true') throw new Error('disabled');
 if(!env.STRIPE_TEST_KEY?.startsWith('sk_test_') && !env.STRIPE_TEST_KEY?.startsWith('rk_test_')) throw new Error('test_key_required');
 if(!env.PAYMENTS_DATABASE_URL || !env.ATTIO_GROWTHCAST_KEY || !env.STRIPE_TEST_SIGNING_SECRET) throw new Error('configuration_missing');
 const dbURL=new URL(env.PAYMENTS_DATABASE_URL);
 // pg connection-string sslmode can override explicit TLS verification. Require explicit TLS here.
 for(const parameter of ['sslmode','sslcert','sslkey','sslrootcert']) if(dbURL.searchParams.has(parameter)) throw new Error('use_explicit_tls');
 const stripe=new Stripe(env.STRIPE_TEST_KEY,{timeout:10000,maxNetworkRetries:0});
 if((await stripe.accounts.retrieve()).id!==ACCOUNT || (await stripe.balance.retrieve()).livemode!==false) throw new Error('stripe_scope');
 const ca=await readFile(new URL('./certs/supabase-prod-ca-2021.crt',import.meta.url),'utf8');
 const pool=new pg.Pool({connectionString:env.PAYMENTS_DATABASE_URL,ssl:{ca,rejectUnauthorized:true},max:3,connectionTimeoutMillis:5000,statement_timeout:15000});
 try {
  const {rows:[role]}=await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  if(!role || role.rolsuper || role.rolbypassrls) throw new Error('privileged_database_role');
  const {rows:[membership]}=await pool.query("SELECT pg_has_role(current_user,'growthcast_payment_receiver','member') AS permitted");
  if(!membership.permitted) throw new Error('wrong_database_role');
 } catch(error) {await pool.end();throw error;}
 const attio={async writeSummary(binding,summary) {
  const url=`https://api.attio.com/v2/objects/client_engagements/records/${binding.engagement_id}`;
  async function request(method='GET',values) {
   const response=await fetch(url,{method,headers:{Authorization:`Bearer ${env.ATTIO_GROWTHCAST_KEY}`,'Content-Type':'application/json'},body:values?JSON.stringify({data:{values}}):undefined,signal:AbortSignal.timeout(8000)});
   if(!response.ok) throw new Error('attio_request');
   return (await response.json()).data;
  }
  const before=await request();
  if(before.id.workspace_id!=='3da36498-5522-43cf-9793-e934f3712439' || before.values.test_record?.[0]?.value!==true) throw new Error('attio_scope');
  const values={stripe_account_id:ACCOUNT,stripe_customer_id:binding.customer_id,stripe_latest_invoice_id:binding.invoice_id,stripe_invoice_status:summary.status[0].toUpperCase()+summary.status.slice(1),stripe_last_reconciled_at:new Date().toISOString()};
  for(const field of ['amount_due','amount_paid','amount_remaining']) values['stripe_'+field]=[{currency_code:'USD',currency_value:summary[field]/100}];
  await request('PATCH',values);
  const after=await request();
  for(const field of ['stripe_account_id','stripe_customer_id','stripe_latest_invoice_id']) if(after.values[field]?.[0]?.value!==values[field]) throw new Error('attio_readback');
  if(after.values.stripe_invoice_status?.[0]?.option?.title!==values.stripe_invoice_status) throw new Error('attio_readback');
  for(const field of ['amount_due','amount_paid','amount_remaining']) {
   const v=after.values['stripe_'+field]?.[0];
   if(v?.currency_code!=='USD' || Math.round(v.currency_value*100)!==summary[field]) throw new Error('attio_readback');
  }
 }};
 const ledger=createLedger({pool,stripe,attio});
 return {pool,ledger,receive:createReceiver({secret:env.STRIPE_TEST_SIGNING_SECRET,enabled:true,ledger,stripe})};
}
