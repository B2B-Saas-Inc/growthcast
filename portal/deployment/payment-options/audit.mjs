import {readFileSync} from 'node:fs';
import {createDecipheriv,hkdfSync} from 'node:crypto';
import pg from '/boundary/node_modules/pg/lib/index.js';
import Stripe from '/upstream/apps/api/node_modules/stripe/esm/stripe.esm.node.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const material=JSON.parse(readFileSync('/private/runtime.json','utf8')),connection=JSON.parse(readFileSync('/private/connection.json','utf8'));
const db=new pg.Client(supabaseConnection({projectRef:connection.projectRef,url:connection.databaseUrl,ca:connection.databaseCa}));
const safe=e=>({type:e.type,code:e.code,param:e.param,statusCode:e.statusCode});
try {await db.connect();const s=(await db.query('SELECT "stripeSecretKey","stripeConnectEnabled","stripeConnectLivemode","stripePaymentMethods" FROM gc_atrium.system_settings WHERE "organizationId"=$1',['review-a40f59d0c00e6dc6-org'])).rows[0];if(!s?.stripeSecretKey)throw Error('No stored Stripe key');
const [iv,tag,ciphertext]=s.stripeSecretKey.split(':');const key=Buffer.from(hkdfSync('sha256',material.secrets.BETTER_AUTH_SECRET,'atrium-settings-encryption','aes-256-gcm-key',32));const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));const secret=Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');const stripe=new Stripe(secret,{timeout:10000,maxNetworkRetries:0});
const report={liveKey:secret.startsWith('sk_live_'),enabled:s.stripeConnectEnabled,savedMethods:s.stripePaymentMethods,readOnly:true};
try {const a=await stripe.accounts.retrieve('me',{expand:['capabilities']});report.originalLookup={success:true,capabilities:a.capabilities};}catch(e){report.originalLookup={success:false,...safe(e)};}
try {const a=await stripe.accounts.retrieve();report.correctLookup={success:true,chargesEnabled:a.charges_enabled,capabilities:a.capabilities};}catch(e){report.correctLookup={success:false,...safe(e)};}
try {const c=await stripe.paymentMethodConfigurations.list({limit:100});report.configurations=c.data.map(x=>({active:x.active,isDefault:x.is_default,livemode:x.livemode,methods:Object.fromEntries(['card','link','us_bank_account','sepa_debit','ideal','bacs_debit','klarna','afterpay_clearpay','affirm','cashapp'].map(m=>[m,{available:x[m]?.available,preference:x[m]?.display_preference?.value}]))}));}catch(e){report.configurationError=safe(e);}
const {availablePaymentMethods}=await import('/upstream/apps/api/dist/payment-methods.js');report.patchedLookup=await availablePaymentMethods({stripe},{card_payments:'card',link_payments:'link',us_bank_account_ach_payments:'us_bank_account',sepa_debit_payments:'sepa_debit',ideal_payments:'ideal',bacs_debit_payments:'bacs_debit',klarna_payments:'klarna',afterpay_clearpay_payments:'afterpay_clearpay',affirm_payments:'affirm',cashapp_payments:'cashapp'});
const hooks=await stripe.webhookEndpoints.list({limit:100});report.portalWebhooks=hooks.data.filter(x=>x.url.includes('clients.staging.growthcast.app')).map(x=>({url:x.url,status:x.status,events:x.enabled_events}));
console.log(JSON.stringify(report));
}catch(e){console.log(JSON.stringify({error:'Read-only Stripe audit failed',...safe(e)}));process.exitCode=1;}finally{await db.end()}
