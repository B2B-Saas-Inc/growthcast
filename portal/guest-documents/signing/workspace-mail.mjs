import {createDecipheriv,hkdfSync} from 'node:crypto';
import nodemailer from 'nodemailer';
import {documentMailer} from './mail.mjs';
// Uses the existing Atrium SettingsService encryption format and workspace row.
// Never accept SMTP hosts, credentials, sender or organization from a send request.
export function workspaceDocumentMailer({pool,organizationId,authSecret,createTransport=nodemailer.createTransport}){
 if(!pool?.query||typeof organizationId!=='string'||!organizationId||typeof authSecret!=='string'||authSecret.length<32)throw Error('Workspace mail configuration required');
 const key=Buffer.from(hkdfSync('sha256',authSecret,'atrium-settings-encryption','aes-256-gcm-key',32));
 return documentMailer(async()=>{
  try{
   const {rows}=await pool.query('SELECT "emailProvider","emailFrom","smtpHost","smtpPort","smtpUser","smtpPass","smtpSecure" FROM gc_atrium.system_settings WHERE "organizationId"=$1',[organizationId]);
   const m=rows[0];
   if(rows.length!==1||m.emailProvider!=='smtp'||m.emailFrom!=='clients@growthcast.app'||m.smtpHost!=='smtp.gmail.com'||m.smtpPort!==465||m.smtpSecure!==true||m.smtpUser!=='ewhite@growthcast.app'||typeof m.smtpPass!=='string'||! /^[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]{2,4096}$/.test(m.smtpPass))throw Error();
   const [iv,tag,data]=m.smtpPass.split(':').map(x=>Buffer.from(x,'hex'));
   const decrypt=createDecipheriv('aes-256-gcm',key,iv);decrypt.setAuthTag(tag);
   const pass=Buffer.concat([decrypt.update(data),decrypt.final()]).toString('utf8');if(!pass)throw Error();
   return createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:m.smtpUser,pass},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'}});
  }catch{throw Error('Workspace mail configuration unavailable');}
 });
}
