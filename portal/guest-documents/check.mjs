import {checkManagement} from './catalog/manage.check.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {connect} from '/foundation/db.mjs';
import {workflow,hash} from './workflow.mjs';
import {messagePreview} from './message.mjs';
import {checkAccess} from './access.check.mjs';
import {checkIngestion} from './ingestion.check.mjs';
import {checkCatalog} from './catalog.check.mjs';
const mode=process.argv[2];
if(mode==='migrate'){
 const db=connect();await db.connect();try{await db.query('BEGIN');await db.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));await db.query(readFileSync(new URL('./catalog/schema.sql',import.meta.url),'utf8'));await db.query(readFileSync(new URL('./catalog/restore-stable.sql',import.meta.url),'utf8'));await db.query('COMMIT');console.log('Candidate guest schema applied only in disposable database.');}finally{await db.end();}
}else{
 const pool=new pg.Pool({host:'database',database:'foundation_test',user:'gc_app',password:readFileSync('/credential/password','utf8').trim(),ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true},max:8});
 const checks=[];const passed=name=>checks.push(name);
 try{
  const q=(sql,args)=>pool.query(sql,args);
  await q(`INSERT INTO gc_atrium.organization(id,name,"updatedAt") VALUES('guest-org','Synthetic',now()),('other-org','Other',now());
   INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES('staff','Staff','staff@example.test',true,now()),('client','Client','client@example.test',true,now()),('unverified','Unverified','unverified@example.test',false,now());
   INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES('staff-member','guest-org','staff','owner'),('client-member','guest-org','client','member'),('unverified-member','guest-org','unverified','owner');
   INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES('guest-project','Guest','guest-org',now()),('other-project','Other','other-org',now());`);
  let validArtifact=true;const verifyArtifact=async s=>validArtifact&&s.organizationId==='guest-org'&&s.projectId==='guest-project'&&s.key==='synthetic/approved.pdf'&&s.sha256===hash('synthetic-approved-bytes');
  const a=workflow(pool,{verifyArtifact}),b=workflow(pool,{verifyArtifact});
  assert.throws(()=>workflow(pool));passed('missing artifact verifier fails closed');
  for(const actor of ['client','unverified','missing'])await assert.rejects(()=>a.createClient(actor,'guest-org','Denied'));await assert.rejects(()=>a.createClient('staff','other-org','Denied'));passed('client, unverified, missing and cross-organization actors denied');
  const c=await a.createClient('staff','guest-org','Pre-account client');const r=await a.createRecipient('staff','guest-org',c,'Recipient@Example.test');
  assert.equal((await q('SELECT count(*)::int n FROM gc_atrium."user"')).rows[0].n,3);assert.equal((await q('SELECT count(*)::int n FROM gc_atrium.invitation')).rows[0].n,0);passed('pre-account client and recipient create no login or invitation');
  await assert.rejects(()=>a.createDocument('staff','guest-org',c,'other-project','contract'));passed('project organization enforced by database');
  const d=await a.createDocument('staff','guest-org',c,'guest-project','contract');
  const input={title:'Approved contract',artifactKey:'synthetic/approved.pdf',artifactSha256:hash('synthetic-approved-bytes')};
  const versions=await Promise.all([a.createVersion('staff','guest-org',d,input),b.createVersion('staff','guest-org',d,input)]);assert.deepEqual(versions.map(v=>v.version).sort(),[1,2]);passed('concurrent version creation serializes without overwrite');
  await assert.rejects(()=>q('UPDATE gc_atrium.guest_version SET title=$1 WHERE id=$2',['Changed',versions[0].id]));passed('runtime cannot mutate approved source versions');
  const other=await a.createClient('staff','guest-org','Another client'),otherRecipient=await a.createRecipient('staff','guest-org',other,'other@example.test');
  await assert.rejects(()=>a.preview('staff','guest-org',versions[0].id,otherRecipient));passed('cross-client document-recipient pairing denied');
  const preview=await a.preview('staff','guest-org',versions[0].id,r);assert.equal(preview.recipient_email,'recipient@example.test');
  const malicious=messagePreview({title:'<img src=x onerror=alert(1)> & "quote"',version:1,recipient_email:'recipient@example.test'});
  assert.ok(malicious.document.html.includes('&lt;img'));assert.ok(!malicious.document.html.includes('<img'));assert.ok(!malicious.pin.html.includes('onerror'));assert.ok(malicious.document.html.includes("default-src 'none'"));passed('email HTML escapes document metadata and blocks remote resources');
  assert.equal(preview.message.from,'GrowthCast <clients@growthcast.app>');assert.equal(preview.message.to,preview.recipient_email);assert.equal(preview.message.policy.pinDelivery,'separate-email-same-recipient');assert.ok(!preview.message.document.text.includes('[Eight-digit access code]'));assert.ok(!preview.message.pin.text.includes('[Secure document link]'));passed('branded preview separates document link and PIN without creating credentials');
  const approval={version:versions[0].id,recipient:r,previewSha256:preview.previewSha256,expiresAt:new Date(Date.now()+3600000).toISOString()};
  await assert.rejects(()=>a.approve('staff','guest-org',{...approval,version:versions[1].id}));await assert.rejects(()=>a.approve('staff','guest-org',{...approval,previewSha256:'0'.repeat(64)}));passed('approval binds exact preview and version');
  const s=preview,documentOnlyHash=hash(JSON.stringify([s.organization_id,s.client_id,s.project_id,s.document_id,s.kind,s.version_id,s.version,s.title,s.artifact_key,s.artifact_sha256,s.recipient_id,s.recipient_email]));
  await assert.rejects(()=>a.approve('staff','guest-org',{...approval,previewSha256:documentOnlyHash}));passed('legacy document-only preview cannot approve an unreviewed email template');
  for(const change of [m=>m.from='Other <other@example.test>',m=>m.document.subject='Changed subject',m=>m.policy.pinDelivery='same-message']) {
   const changed=structuredClone(preview.message);change(changed);
   const changedHash=hash(JSON.stringify([s.organization_id,s.client_id,s.project_id,s.document_id,s.kind,s.version_id,s.version,s.title,s.artifact_key,s.artifact_sha256,s.recipient_id,s.recipient_email,changed]));
   await assert.rejects(()=>a.approve('staff','guest-org',{...approval,previewSha256:changedHash}));
  }passed('sender, message and PIN-policy changes invalidate approval');

  validArtifact=false;await assert.rejects(()=>a.approve('staff','guest-org',approval));validArtifact=true;passed('changed or missing artifact cannot be approved');
  for(const expiresAt of [new Date(0).toISOString(),new Date(Date.now()+31*86400000).toISOString()])await assert.rejects(()=>a.approve('staff','guest-org',{...approval,expiresAt}));passed('expired and overlong approvals rejected');
  const approved=await a.approve('staff','guest-org',approval);
  assert.deepEqual((await q('SELECT message_snapshot FROM gc_atrium.guest_approval WHERE id=$1',[approved])).rows[0].message_snapshot,preview.message);passed('approval persists the exact reviewed sender, messages and PIN policy');
  await assert.rejects(()=>q('UPDATE gc_atrium.guest_approval SET id=id WHERE id=$1',[approved]));await assert.rejects(()=>q('UPDATE gc_atrium.guest_document SET id=id WHERE id=$1',[d]));passed('row-lock privilege cannot modify immutable approvals or documents');
  validArtifact=false;await assert.rejects(()=>a.prepareDispatch('staff','guest-org',approved));validArtifact=true;passed('artifact binding rechecked before dispatch preparation');
  const dispatched=await Promise.all([a.prepareDispatch('staff','guest-org',approved),b.prepareDispatch('staff','guest-org',approved)]);assert.equal(dispatched[0].id,dispatched[1].id);
  assert.equal((await q("SELECT count(*)::int n FROM gc_atrium.guest_audit WHERE action='dispatch_prepared'")).rows[0].n,1);passed('concurrent retry prepares one dispatch and one audit event');
  await assert.rejects(()=>b.revoke('client','guest-org',dispatched[0].id));await a.revoke('staff','guest-org',dispatched[0].id);await assert.rejects(()=>a.prepareDispatch('staff','guest-org',approved));passed('revoked dispatch cannot be replayed');
  await assert.rejects(()=>q("UPDATE gc_atrium.guest_dispatch SET status='prepared',revoked_at=NULL WHERE id=$1",[dispatched[0].id]));await assert.rejects(()=>q('DELETE FROM gc_atrium.guest_audit'));passed('reactivation and audit deletion denied');
  await q("UPDATE gc_atrium.member SET role='member' WHERE id='staff-member'");await assert.rejects(()=>a.preview('staff','guest-org',versions[0].id,r));passed('current staff authorization required on every call');
  const counts=(await q('SELECT (SELECT count(*) FROM gc_atrium.guest_approval)::int approvals,(SELECT count(*) FROM gc_atrium.guest_dispatch)::int dispatches')).rows[0];assert.deepEqual(counts,{approvals:1,dispatches:1});passed('failed operations roll back without partial approval or dispatch');
  await q("UPDATE gc_atrium.member SET role='owner' WHERE id='staff-member'");
  const accessApproval=await a.approve('staff','guest-org',approval);
  await checkAccess({pool,flow:a,approval:accessApproval,passed});
  await checkCatalog({pool,flow:a,passed});
  await checkIngestion({pool,passed});
  const fields=[{type:'SIGNATURE',label:'Signature',required:true,page:1,positionX:10,positionY:50,width:35,height:10},{type:'TEXT',label:'Company name',required:true,page:1,positionX:10,positionY:20,width:40,height:6}];
  const fieldPreview=await a.preview('staff','guest-org',versions[0].id,r,fields);
  assert.notEqual(fieldPreview.previewSha256,preview.previewSha256);
  const fieldApproval={...approval,previewSha256:fieldPreview.previewSha256,fields};
  await assert.rejects(()=>a.approve('staff','guest-org',{...fieldApproval,fields:[{...fields[0],positionX:20},fields[1]]}));
  await assert.rejects(()=>a.approve('staff','guest-org',{...fieldApproval,fields:undefined}));passed('field placement and omission invalidate an earlier approval preview');
  const fieldApproved=await a.approve('staff','guest-org',fieldApproval);
  const stored=(await q('SELECT message_snapshot FROM gc_atrium.guest_approval WHERE id=$1',[fieldApproved])).rows[0].message_snapshot;
  assert.deepEqual(stored.signing.fields,fieldPreview.message.signing.fields);passed('approval immutably stores exact recipient field layout alongside reviewed messages');
  assert.deepEqual((await a.savedFields('staff','guest-org',versions[0].id,r)).fields,fieldPreview.message.signing.fields);await assert.rejects(()=>a.savedFields('client','guest-org',versions[0].id,r));passed('saved recipient layouts restore only for currently authorized staff');
  const fieldDispatch=await a.prepareDispatch('staff','guest-org',fieldApproved);assert.equal(fieldDispatch.status,'prepared');passed('dispatch preparation reconstructs the approved field layout without sending');

  await checkManagement(pool,passed);
  const evidence={checkedAt:new Date().toISOString(),scope:'local candidate guest document workflow against actual nine-migration Atrium schema',checks,passed:checks.length,cloudWrites:0,emailsSent:0,publicGuestRoutes:false,localGuestHttpTested:true};writeFileSync('/evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,cloudWrites:0,emailsSent:0}));
 }finally{await pool.end();}
}
