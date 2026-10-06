import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {workspaceDocumentMailer} from './workspace-mail.mjs';
const authSecret=randomBytes(32).toString('hex');
function encrypt(pass){const iv=randomBytes(16),c=createCipheriv('aes-256-gcm',Buffer.from(hkdfSync('sha256',authSecret,'atrium-settings-encryption','aes-256-gcm-key',32)),iv),data=Buffer.concat([c.update(pass),c.final()]);return [iv,c.getAuthTag(),data].map(b=>b.toString('hex')).join(':');}
const row=()=>({emailProvider:'smtp',emailFrom:'clients@growthcast.app',smtpHost:'smtp.gmail.com',smtpPort:465,smtpSecure:true,smtpUser:'ewhite@growthcast.app',smtpPass:encrypt('synthetic-app-password')});
const message={to:'client@example.test',from:'GrowthCast <clients@growthcast.app>',subject:'Synthetic',text:'Synthetic'};
test('uses current encrypted Workspace settings and preserves approved message',async()=>{
 let queried=0,closed=0;const m=row();
 const mail=workspaceDocumentMailer({authSecret,organizationId:'org',pool:{async query(sql,args){assert.deepEqual(args,['org']);queried++;return {rows:[m]};}},createTransport(config){assert.equal(config.auth.pass,'synthetic-app-password');assert.equal(config.host,'smtp.gmail.com');assert.equal(config.tls.rejectUnauthorized,true);return {async sendMail(input){assert.deepEqual(input,message);return {accepted:[message.to],rejected:[]};},close(){closed++;}};}});
 assert.deepEqual(await mail.send(message),{accepted:true});assert.equal(closed,1);m.smtpHost='untrusted.example';await assert.rejects(mail.send(message));assert.equal(queried,2);assert.equal(closed,1);
});
test('wrong workspace, changed sender, damaged ciphertext and wrong auth secret do not open SMTP',async()=>{
 for(const change of [null,{emailFrom:'other@example.test'},{smtpUser:'other@example.test'},{smtpPort:587},{smtpSecure:false},{emailProvider:'resend'},{smtpPass:'invalid'}]){
  const m=change===null?null:{...row(),...change};let opened=false;
  const mail=workspaceDocumentMailer({authSecret,organizationId:'org',pool:{async query(){return {rows:m?[m]:[]};}},createTransport(){opened=true;throw Error();}});
  await assert.rejects(mail.send(message));assert.equal(opened,false);
 }
 const mail=workspaceDocumentMailer({authSecret:randomBytes(32).toString('hex'),organizationId:'org',pool:{async query(){return {rows:[row()]};}},createTransport(){assert.fail('SMTP must not open');}});
 await assert.rejects(mail.send(message));
});
test('SMTP uncertainty does not leak credentials or provider errors and closes transport',async()=>{
 let closed=false;const mail=workspaceDocumentMailer({authSecret,organizationId:'org',pool:{async query(){return {rows:[row()]};}},createTransport(){return {async sendMail(){throw Error('synthetic-private-provider-detail');},close(){closed=true;}};}});
 await assert.rejects(mail.send(message),e=>e.message==='Document mail outcome unconfirmed');assert.equal(closed,true);
});
