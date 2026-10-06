// Disposable browser fixture only. Never used by deployment packaging.
import assert from 'node:assert/strict';
import {pdf} from './pdf-fixture.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const ssl={ca:readFileSync('/runtime/database-ca.crt','utf8'),rejectUnauthorized:true};
const state=JSON.parse(readFileSync('/auth/session.json'));
if(process.argv[2]==='seed') {
 mkdirSync('/pdf-fixtures',{recursive:true});writeFileSync('/pdf-fixtures/clean.pdf',pdf());writeFileSync('/pdf-fixtures/tagged.pdf',pdf('','','{{signature, r1}}    {{text, r1, required=true, label=Company Name}}'));writeFileSync('/pdf-fixtures/invalid.pdf','This is not a PDF.');
 const db=new pg.Client({host:'db.abcdefghijklmnopqrst.supabase.co',database:'postgres',user:'postgres',password:readFileSync('/admin/password','utf8'),ssl});await db.connect();
 try {
  await db.query('BEGIN; SET ROLE gc_migrate; SET search_path=gc_atrium,pg_catalog');await db.query(readFileSync('/foundation/guest/schema.sql','utf8'));await db.query(readFileSync('/foundation/guest/catalog/schema.sql','utf8'));await db.query(readFileSync('/foundation/guest/catalog/restore-stable.sql','utf8'));await db.query(readFileSync('/foundation/guest/signing/delivery.sql','utf8'));await db.query('RESET ROLE');
  await db.query('UPDATE gc_atrium.member SET role=\'admin\' WHERE "userId"=$1',[state.identity]);
  await db.query('UPDATE gc_atrium.organization SET "setupCompleted"=true WHERE id=\'runtime-org\'');
  await db.query('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES(\'guest-ui-project\',\'Website launch\',\'runtime-org\',now())');
  for(let i=0;i<31;i++) {const client=randomUUID();await db.query('INSERT INTO gc_atrium.guest_client VALUES($1,\'runtime-org\',$2)',[client,'Review client '+i]);await db.query('INSERT INTO gc_atrium.guest_document VALUES($1,$2,\'runtime-org\',\'guest-ui-project\',\'proposal\')',[randomUUID(),client]);}
  await db.query('COMMIT');
 }finally{await db.end();}
} else if(['member','admin'].includes(process.argv[2])) {
 const db=new pg.Client({connectionString:readFileSync('/runtime/database-url','utf8'),ssl});await db.connect();try{await db.query('UPDATE gc_atrium.member SET role=$1 WHERE "userId"=$2',[process.argv[2],state.identity]);}finally{await db.end();}
}else if(process.argv[2]==='approval') {
 const db=new pg.Client({connectionString:readFileSync('/runtime/database-url','utf8'),ssl});await db.connect();
 try {
  const {rows}=await db.query(`SELECT a.recipient_email,a.approved_by,v.title,v.version,a.expires_at>a.approved_at AS valid FROM gc_atrium.guest_approval a JOIN gc_atrium.guest_version v ON v.id=a.version_id`);
  assert.equal(rows.length,1);assert.deepEqual({...rows[0]},{recipient_email:'recipient@example.test',approved_by:state.identity,title:'Reviewed proposal',version:1,valid:true});
  const message=(await db.query('SELECT message_snapshot FROM gc_atrium.guest_approval')).rows[0].message_snapshot;assert.equal(message.from,'GrowthCast <clients@growthcast.app>');assert.equal(message.to,'recipient@example.test');assert.equal(message.policy.pinDigits,8);assert.ok(message.document.text.includes('Reviewed proposal'));assert.equal(message.signing.fields.length,2);assert.equal(message.signing.fields[1].label,'Company name');assert.equal(message.signing.fields[1].positionY,30);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM gc_atrium.guest_dispatch')).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM gc_atrium.guest_audit WHERE action='approved'")).rows[0].n,1);
 }finally{await db.end();}
}else if(process.argv[2]==='delivery'){
 const db=new pg.Client({connectionString:readFileSync('/runtime/database-url','utf8'),ssl});await db.connect();
 try{
  const {rows}=await db.query('SELECT status FROM gc_atrium.guest_send');assert.deepEqual(rows,[{status:'sent'}]);
  assert.equal((await db.query("SELECT count(*)::int n FROM gc_atrium.guest_send_event WHERE status='creating'")).rows[0].n,1);
  const mail=await (await fetch('http://mail:1080/email')).json();
  const delivered=mail.filter(m=>m.to?.some(r=>r.address==='recipient@example.test'));
  assert.equal(delivered.length,2);assert.ok(delivered.some(m=>m.subject==='GrowthCast document: Reviewed proposal'));assert.ok(delivered.some(m=>m.subject==='Your GrowthCast document access code'));
 }finally{await db.end();}
}else throw Error('Unknown fixture mode');
console.log('Synthetic guest UI fixture operation completed.');
