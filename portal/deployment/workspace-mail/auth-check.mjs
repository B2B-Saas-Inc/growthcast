import {readFileSync} from 'node:fs';
import {createDecipheriv,hkdfSync} from 'node:crypto';
import pg from '/boundary/node_modules/pg/lib/index.js';
import nodemailer from '/upstream/apps/api/node_modules/nodemailer/lib/nodemailer.js';
import {supabaseConnection} from '/boundary/deployment/supabase-config.mjs';
const material=JSON.parse(readFileSync('/private/runtime.json','utf8'));
const connection=JSON.parse(readFileSync('/private/connection.json','utf8'));
const db=new pg.Client(supabaseConnection({projectRef:connection.projectRef,url:connection.databaseUrl,ca:connection.databaseCa}));
let transport;
try{await db.connect();const {rows}=await db.query('SELECT "emailFrom","smtpHost","smtpPort","smtpSecure","smtpUser","smtpPass" FROM gc_atrium.system_settings WHERE "organizationId"=$1',['review-a40f59d0c00e6dc6-org']);const s=rows[0];if(s.smtpHost!=='smtp.gmail.com'||s.smtpPort!==465||!s.smtpSecure||s.smtpUser!=='ewhite@growthcast.app'||s.emailFrom!=='clients@growthcast.app')throw Error('Config');
 const [iv,tag,ciphertext]=s.smtpPass.split(':');const key=Buffer.from(hkdfSync('sha256',material.secrets.BETTER_AUTH_SECRET,'atrium-settings-encryption','aes-256-gcm-key',32));const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));const pass=Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');
 transport=nodemailer.createTransport({host:s.smtpHost,port:465,secure:true,auth:{user:s.smtpUser,pass},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,tls:{rejectUnauthorized:true}});await transport.verify();console.log(JSON.stringify({smtpAuthentication:true,tlsVerified:true,emailSent:false}));
}catch(e){console.log(JSON.stringify({smtpAuthentication:false,emailSent:false,code:typeof e.code==='string'?e.code:'CONFIG_OR_DECRYPT',responseCode:typeof e.responseCode==='number'?e.responseCode:null}));process.exitCode=1}finally{transport?.close();await db.end()}
