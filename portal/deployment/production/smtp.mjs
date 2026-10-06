import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import pg from '/boundary/node_modules/pg/lib/index.js';
import Stripe from '/upstream/apps/api/node_modules/stripe/esm/stripe.esm.node.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
import {SettingsService} from '/upstream/apps/api/dist/settings/settings.service.js';
const c=JSON.parse(readFileSync('/private/connection.json')),identity=JSON.parse(readFileSync('/private/identity.json'));
assert.equal(c.projectRef,'mdjldxussxdtcjxsoesr');const config=supabaseConnection({url:c.databaseUrl,projectRef:c.projectRef,ca:c.databaseCa});config.options='';const db=new pg.Client(config);
const settings=new SettingsService({},{getOrThrow:()=>identity.runtime.secrets.BETTER_AUTH_SECRET},{warn:()=>{}});
let transport;
try {
 await db.connect();const rows=(await db.query('SELECT "smtpHost","smtpPort","smtpSecure","smtpUser","smtpPass" FROM gc_atrium.system_settings WHERE "smtpPass" IS NOT NULL')).rows;assert.equal(rows.length,1);const r=rows[0];
 const {default:mailer}=await import('/upstream/apps/api/node_modules/nodemailer/lib/nodemailer.js');
 transport=mailer.createTransport({host:r.smtpHost,port:r.smtpPort,secure:r.smtpSecure,auth:{user:r.smtpUser,pass:settings.decrypt(r.smtpPass)},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000});
 assert(await transport.verify());console.log(JSON.stringify({tlsAuthenticationVerified:true,emailsSent:0}));
} catch(e){console.error(JSON.stringify({stage:'smtp-verification',code:e.code}));process.exitCode=1}finally{transport?.close();await db.end()}
