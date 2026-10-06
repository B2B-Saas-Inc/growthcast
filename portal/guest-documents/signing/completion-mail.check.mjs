import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {completionMail,completionMessage} from './completion-mail.mjs';
const bytes=Buffer.from('%PDF-1.7 verified fixture'),row={id:'00000000-0000-4000-8000-000000000001',sha256:createHash('sha256').update(bytes).digest('hex'),storage_key:'completed.pdf',recipient_email:'review@growthcast.invalid',title:'<Contract & Company>'};
function fixture(send){
 const events=[];const pool={async query(sql,args){if(sql.startsWith('INSERT')){events.push(args[2]);return {rowCount:1,rows:[]};}if(sql.startsWith('SELECT id'))return {rowCount:1,rows:[row]};if(sql.startsWith('SELECT s.id'))return {rowCount:events.length||args[0]!=='workspace'?0:1,rows:events.length||args[0]!=='workspace'?[]:[row]};return {rowCount:0,rows:[]};},async connect(){return {...this,release(){}};}};
 return {events,pool,worker:completionMail({pool,organizationId:'workspace',readArtifact:async()=>({bytes,contentType:'application/pdf'}),mailer:{send}})};
}
test('SMTP uncertainty is durable and is not automatically repeated',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw Error('timeout after acceptance');});assert.deepEqual(await f.worker.runOnce(),{processed:true,accepted:false});assert.deepEqual(f.events,['completion_mail_sending','completion_mail_uncertain']);await f.worker.runOnce();assert.equal(calls,1);
});
test('a prior interrupted claim is held for operator review',async()=>{
 const f=fixture(async()=>assert.fail('must not resend'));f.events.push('completion_mail_sending');assert.deepEqual(await f.worker.runOnce(),{processed:false});
});
test('confirmation contains the exact PDF and escapes document title',()=>{
 const m=completionMessage(row,bytes);assert.ok(m.html.includes('&lt;Contract &amp; Company&gt;'));assert.equal(m.attachments[0].content,bytes);assert.equal(m.to,row.recipient_email);assert.equal(m.from,'GrowthCast <clients@growthcast.app>');assert.ok(m.messageId.includes(row.id));assert.equal(m.attachments[0].filename,'signed-document.pdf');
});
test('workspace without eligible completions causes no transport side effect',async()=>{
 const f=fixture(async()=>assert.fail('wrong workspace'));const other=completionMail({pool:f.pool,organizationId:'other',readArtifact:async()=>assert.fail('must not read'),mailer:{send:async()=>assert.fail('must not send')}});assert.deepEqual(await other.runOnce(),{processed:false});
});
