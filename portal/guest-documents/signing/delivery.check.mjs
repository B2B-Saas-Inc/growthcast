import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import pg from 'pg';
import nodemailer from 'nodemailer';
import {connect} from '/foundation/db.mjs';
import {workflow,hash} from '../workflow.mjs';
import {pdf} from '../web/pdf-fixture.mjs';
import {documentDelivery} from './delivery.mjs';
import {deliverySecrets} from './secrets.mjs';
import {documentMailer,deliveryMessages} from './mail.mjs';
import {documentCompletion} from './completion.mjs';
import {completionMail} from './completion-mail.mjs';
import {completionQueue} from './completion-worker.mjs';
import {sealedPdfVerifier} from './verify-pdf.mjs';
import {createStore} from '/foundation/gateway/src/store.mjs';
import {deliveryGateway,documentGrantTtl} from './gateway.mjs';
import {signingProvider} from './provider.mjs';
import {countPdfPages} from './pdf.mjs';
if(process.argv[2]==='migrate'){
 const db=connect();await db.connect();try{await db.query('BEGIN');await db.query(readFileSync(new URL('./delivery.sql',import.meta.url),'utf8'));await db.query('COMMIT');console.log('Additive delivery candidate applied in disposable database.');}finally{await db.end();}
}else if(process.argv[2]==='completion'){
 const config=JSON.parse(readFileSync('/provider-runtime/provider.json','utf8'))[0],fixture=JSON.parse(readFileSync('/provider-runtime/delivery-browser.json','utf8'));
 const api=async path=>{const r=await fetch('http://signing-documenso:3000/api/v2'+path,{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Canonical completion unavailable');return r;};
 let envelope;for(let attempt=0;attempt<30;attempt++){envelope=await (await api('/envelope/'+fixture.binding.envelopeId)).json();if(envelope.status==='COMPLETED')break;await new Promise(r=>setTimeout(r,1000));}
 assert.equal(envelope.status,'COMPLETED');assert.equal(envelope.fields.find(f=>f.type==='TEXT')?.customText,'Synthetic Company');assert.equal(envelope.teamId,config.teamId);assert.equal(envelope.recipients[0].id,fixture.binding.recipientId);assert.equal(envelope.recipients[0].signingStatus,'SIGNED');assert.equal(envelope.envelopeItems[0].id,fixture.binding.items[0].id);
 const bytes=Buffer.from(await (await api('/envelope/item/'+envelope.envelopeItems[0].id+'/download')).arrayBuffer());assert.notEqual(hash(bytes),fixture.binding.artifactSha256);writeFileSync('/provider-runtime/delivery-sealed.pdf',bytes,{mode:0o600});
 console.log('Canonical provider reports completion and returns the sealed PDF for the approved document.');
 const verify=sealedPdfVerifier('/provider-runtime/tls.crt');assert.equal(await verify(bytes),true);const changed=Buffer.from(bytes);changed[10]^=1;assert.equal(await verify(changed),false);
 const configFor=user=>({host:'database',database:'foundation_test',user,password:readFileSync(user==='gc_lifecycle'?'/lifecycle/password':'/credential/password','utf8').trim(),ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true}});
 const lifecycle=new pg.Pool(configFor('gc_lifecycle')),app=new pg.Pool(configFor('gc_app'));
 const objects=new Map(),storage={upload:async(key,value,contentType)=>{assert.ok(!objects.has(key));objects.set(key,{bytes:Buffer.from(value),contentType});},download:async key=>{if(!objects.has(key))throw Error('Missing');return objects.get(key);}};
 try{
  const completion=documentCompletion({pool:lifecycle,api,verifySealed:verify,storage,teamId:config.teamId});
  await assert.rejects(()=>app.query('SELECT * FROM gc_atrium.guest_pending_completions(NULL)'),e=>e.code==='42501');
  await assert.rejects(()=>lifecycle.query('SELECT access_ciphertext FROM gc_atrium.guest_send'),e=>e.code==='42501');
  const queue=completionQueue({pool:lifecycle,completion,secrets:deliverySecrets(Buffer.from(fixture.encryptionKey,'hex'))});
  const queued=await queue.runOnce();assert.equal(queued.completed,1);assert.equal(queued.failed,0);
  assert.equal((await lifecycle.query('SELECT * FROM gc_atrium.guest_pending_completions(NULL)')).rows.some(r=>r.id===fixture.sendId),false);
  const result=await completion.reconcile(fixture);fixture.sealed={id:envelope.envelopeItems[0].id,dataId:envelope.envelopeItems[0].documentDataId,sha256:result.sha256};writeFileSync('/provider-runtime/delivery-browser.json',JSON.stringify(fixture),{mode:0o600});assert.deepEqual(await completion.reconcile(fixture),result);assert.equal(objects.size,1);
  const native=(await app.query('SELECT d.status,d."projectId",d."signedFileId",f."storageKey" FROM gc_atrium.document d JOIN gc_atrium.file f ON f.id=d."fileId" WHERE d.id=$1',[result.documentId])).rows[0];
  assert.equal(native.status,'signed');assert.equal(native.projectId,'delivery-project');assert.ok(native.signedFileId);assert.equal(native.storageKey,'guest-executed/'+fixture.sendId+'.pdf');
  await assert.rejects(()=>app.query('SELECT gc_atrium.publish_guest_completion($1,$2,$3,$4,$5)',[fixture.sendId,envelope.envelopeItems[0].id,envelope.envelopeItems[0].documentDataId,hash(bytes),bytes.length]));
  await assert.rejects(()=>app.query("UPDATE gc_atrium.document SET status='pending' WHERE id=$1",[result.documentId]));
  await assert.rejects(()=>completion.reconcile({...fixture,binding:{...fixture.binding,recipientEmail:'wrong@growthcast.invalid'}}));
  console.log('Verified PDF published once to the original project; HTTP role cannot forge completion or overwrite provider ownership.');
  let confirmations=0;
  const smtpConfirmation=documentMailer(()=>nodemailer.createTransport({host:'delivery-mail',port:1025,secure:false}));
  const confirmation=completionMail({pool:app,organizationId:'delivery-org',readArtifact:async key=>objects.get(key),mailer:{async send(message){confirmations++;assert.equal(message.to,fixture.binding.recipientEmail);assert.equal(message.attachments.length,1);assert.equal(hash(message.attachments[0].content),result.sha256);assert.ok(message.html.includes('GrowthCast'));return smtpConfirmation.send(message);}}});
  const damaged=completionMail({pool:app,organizationId:'delivery-org',readArtifact:async()=>({bytes:Buffer.from('not signed PDF'),contentType:'application/pdf'}),mailer:{send:async()=>{throw Error('Must not send');}}});
  await assert.rejects(()=>damaged.runOnce(),/attachment unavailable/);
  await Promise.all([confirmation.runOnce(),confirmation.runOnce()]);assert.equal(confirmations,1);await confirmation.runOnce();assert.equal(confirmations,1);
  assert.equal((await app.query("SELECT status FROM gc_atrium.guest_send_event WHERE send_id=$1 AND status='completion_mail_accepted'",[fixture.sendId])).rowCount,1);
  console.log('Verified completion attachment sent through SMTP exactly once across concurrent workers and restart; altered bytes refused.');

  const evidence=JSON.parse(readFileSync('/delivery-evidence.json','utf8'));evidence.clientSigningBrowser=true;evidence.recipientInputVerified=true;evidence.canonicalCompletion=true;evidence.cryptographicPdfVerification=true;evidence.projectProjection=true;evidence.lifecycleQueueVerified=true;evidence.lifecyclePinReadDenied=true;evidence.httpQueueReadDenied=true;evidence.completionChecks=6;writeFileSync('/delivery-evidence.json',JSON.stringify(evidence,null,2)+'\n');
 }finally{await lifecycle.end();await app.end();}

}else{
 const pool=new pg.Pool({host:'database',database:'foundation_test',user:'gc_app',password:readFileSync('/credential/password','utf8').trim(),ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true},max:8});
 const gatewayUrl=new URL('postgresql://gc_app@database/foundation_test');gatewayUrl.password=readFileSync('/credential/password','utf8').trim();gatewayUrl.searchParams.set('options','-csearch_path=gc_atrium,pg_catalog');
 const gatewayStore=createStore(gatewayUrl.href,{maxGrantTtl:documentGrantTtl,ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true}});
 const gatewayAdapter=deliveryGateway({store:gatewayStore,pool,environment:'local-test'});
 const checks=[],passed=name=>{checks.push(name);console.log('PASS '+name);},bytes=pdf('','','{{signature, r1}} {{text, r1, required=true, label=Company}}');
 const encryptionKey=randomBytes(32),secrets=deliverySecrets(encryptionKey),flow=workflow(pool,{verifyArtifact:async()=>true});
 const messages=async()=>await (await fetch('http://delivery-mail:1080/email')).json();
 const smtp=documentMailer(()=>nodemailer.createTransport({host:'delivery-mail',port:1025,secure:false,connectionTimeout:3000,socketTimeout:5000}));
 let creates=0,activates=0,grants=0;
 let actualProvider;
 assert.equal(process.env.REAL_SIGNING,'1');
 if(process.env.REAL_SIGNING==='1'){
  const config=JSON.parse(readFileSync('/provider-runtime/provider.json','utf8'))[0];
  actualProvider=signingProvider({teamId:config.teamId,api:async(path,options={})=>{
   const response=await fetch('http://signing-documenso:3000/api/v2'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+config.token},redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error('Provider request failed');return response;
  }});
 }
 const provider={prepareSource:(source,bytes)=>actualProvider?actualProvider.prepareSource(source,bytes):source,configureDraft:(id,source)=>actualProvider?.configureDraft(id,source),createDraft:async(source,bytes)=>{creates++;return actualProvider?actualProvider.createDraft(source,bytes):{envelopeId:'synthetic-'+source.approvalId};},inspectDraft:async(id,source)=>actualProvider?.inspectDraft(id,source),activate:async(id,source)=>{activates++;return actualProvider?actualProvider.activate(id,source):{recipientToken:'private-provider-token'};}};
 const gateway={provision:async input=>{grants++;return gatewayAdapter.provision(input);}};
 const dependencies={pool,flow,provider,readArtifact:async()=>bytes,countPages:countPdfPages,gateway,mailer:smtp,secrets,signingOrigin:'https://signing.growthcast.test'};
 const delivery=documentDelivery(dependencies);
 async function fixture(fields,requirePin=true){
  const id=randomUUID(),client=await flow.createClient('sender','delivery-org','Client '+id),recipient=await flow.createRecipient('sender','delivery-org',client,id+'@growthcast.invalid');
  const document=await flow.createDocument('sender','delivery-org',client,'delivery-project','contract');
  const version=await flow.createVersion('sender','delivery-org',document,{title:'Synthetic contract',artifactKey:'synthetic/'+id+'.pdf',artifactSha256:hash(bytes)});
  fields??=[{type:'SIGNATURE',label:'Signature',required:true,page:1,positionX:10,positionY:20,width:40,height:10}];
  const preview=await flow.preview('sender','delivery-org',version.id,recipient,fields,requirePin);
  const approval=await flow.approve('sender','delivery-org',{version:version.id,recipient,fields,requirePin,previewSha256:preview.previewSha256,expiresAt:new Date(Date.now()+7*86400000).toISOString()});
  return {approval,version,recipient,preview};
 }
 try{
  await pool.query(`INSERT INTO gc_atrium.organization(id,name,"updatedAt") VALUES('delivery-org','Synthetic delivery',now());
   INSERT INTO gc_atrium."user"(id,name,email,"emailVerified","updatedAt") VALUES('sender','Sender','sender@growthcast.invalid',true,now()),('reader','Reader','reader@growthcast.invalid',true,now());
   INSERT INTO gc_atrium.member(id,"organizationId","userId",role) VALUES('sender-member','delivery-org','sender','owner'),('reader-member','delivery-org','reader','member');
   INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES('delivery-project','Delivery','delivery-org',now());`);
  assert.equal(await countPdfPages(bytes),1);await assert.rejects(()=>countPdfPages(Buffer.from('%PDF-1.7 malformed')));passed('actual PDF page count succeeds and malformed PDF is refused');
  const secretId=randomUUID(),sealed=secrets.seal(secretId,{pin:'12345678',share:'private'});assert.equal(secrets.open(secretId,sealed).pin,'12345678');assert.ok(!sealed.includes('12345678'));assert.throws(()=>secrets.open(randomUUID(),sealed));assert.throws(()=>secrets.open(secretId,sealed.slice(0,-3)+'abc'));passed('delivery secrets are encrypted and bound to one send record');
  const f=await fixture();await assert.rejects(()=>delivery.request('reader','delivery-org',f.approval));await assert.rejects(()=>delivery.request('sender','other-org',f.approval));passed('client and cross-organization send requests are denied');
  const requests=await Promise.all([delivery.request('sender','delivery-org',f.approval),delivery.request('sender','delivery-org',f.approval)]);assert.equal(requests[0].id,requests[1].id);assert.equal(creates,0);assert.equal((await messages()).length,0);passed('concurrent send requests queue exactly one job without transport side effects');
  await Promise.all([delivery.runOnce(),delivery.runOnce()]);const state=await delivery.status('sender','delivery-org',requests[0].id);assert.equal(state.status,'sent');assert.equal(creates,1);assert.equal(activates,1);assert.equal(grants,1);assert.equal((await messages()).length,2);passed('one worker prepares provider access and sends two real SMTP messages to local capture');
  assert.deepEqual(Object.keys(state).sort(),['approvalId','failureCode','id','status']);await assert.rejects(()=>delivery.status('reader','delivery-org',state.id));passed('staff send status exposes no provider tokens, PIN or private link');
  const row=(await pool.query('SELECT * FROM gc_atrium.guest_send WHERE id=$1',[state.id])).rows[0];const access=secrets.open(row.id,row.access_ciphertext);
  assert.equal(await gatewayAdapter.pinAccess.unlock(access.share,'','synthetic-source'),null);
  assert.equal(await gatewayAdapter.pinAccess.unlock(access.share,'00000000','synthetic-source'),null);
  const handoff=await gatewayAdapter.pinAccess.unlock(access.share,access.pin,'synthetic-source');assert.ok(handoff);
  const session=await gatewayAdapter.store.redeem(handoff);assert.ok(session);assert.equal(await gatewayAdapter.store.redeem(handoff),null);
  const authorized=await gatewayAdapter.store.authorize(session.token);assert.equal(authorized.binding.documentVersion,f.version.id);assert.equal(authorized.binding.recipientEmail,f.preview.recipient_email);passed('delivered PIN opens a one-use handoff bound to the actual Documenso recipient and version');
  const grantTiming=(await pool.query('SELECT g.expires_at AS grant_expiry,a.expires_at AS approval_expiry FROM gc_atrium.grants g JOIN gc_atrium.guest_send_grant sg ON sg.grant_id=g.id JOIN gc_atrium.guest_send s ON s.id=sg.send_id JOIN gc_atrium.guest_approval a ON a.id=s.approval_id WHERE s.id=$1',[row.id])).rows[0];
  assert.ok(grantTiming.grant_expiry.getTime()-Date.now()>6*86400000);
  assert.ok(Math.abs(grantTiming.grant_expiry-grantTiming.approval_expiry)<2000);
  passed('new signing link follows the seven-day approval expiry instead of a one-hour grant');
  const hydrated=deliveryMessages(f.preview,access,dependencies.signingOrigin,row.id);assert.ok(hydrated.document.html.includes('/unlock#'+access.share));assert.ok(!hydrated.document.text.includes(access.pin));assert.ok(!hydrated.pin.text.includes(access.share));assert.equal(hydrated.document.from,'GrowthCast <clients@growthcast.app>');assert.ok(hydrated.document.html.includes('#ff6b4a'));passed('branded document and PIN emails keep access secrets in separate messages');
  const captured=await messages();for(const summary of captured){const item=await (await fetch('http://delivery-mail:1080/email/'+summary.id)).json();assert.ok(item.html.includes('GrowthCast'));assert.equal(item.to[0].address,f.preview.recipient_email);}passed('SMTP capture confirms exact approved recipient and rendered HTML');
  await delivery.request('sender','delivery-org',f.approval);await delivery.runOnce();assert.equal(creates,1);assert.equal((await messages()).length,2);passed('repeated request and worker restart do not resend or recreate');
  await assert.rejects(()=>pool.query("UPDATE gc_atrium.guest_send SET status='queued' WHERE id=$1",[state.id]));await assert.rejects(()=>pool.query('DELETE FROM gc_atrium.guest_send_event'));passed('terminal send state and append-only send history cannot be reset');
  await flow.revoke('sender','delivery-org',row.dispatch_id);assert.equal((await delivery.status('sender','delivery-org',row.id)).status,'revoked');assert.equal(await gatewayAdapter.store.authorize(session.token),null);assert.equal(await gatewayAdapter.pinAccess.unlock(access.share,access.pin,'synthetic-source'),null);passed('dispatch revocation immediately denies the delivered PIN and existing signing session');
  const invalid=await fixture([{type:'SIGNATURE',label:'Signature',required:true,page:2,positionX:10,positionY:20,width:40,height:10}]);const invalidJob=await delivery.request('sender','delivery-org',invalid.approval);await delivery.runOnce();assert.equal((await delivery.status('sender','delivery-org',invalidJob.id)).status,'needs_review');assert.equal(creates,1);passed('server rejects fields on nonexistent PDF pages before provider creation');
  const interrupted=await fixture(),interruptedJob=await delivery.request('sender','delivery-org',interrupted.approval);await pool.query("UPDATE gc_atrium.guest_send SET status='creating',lease_id=$2,lease_until=now()-interval '1 second' WHERE id=$1",[interruptedJob.id,randomUUID()]);await delivery.runOnce();assert.equal((await delivery.status('sender','delivery-org',interruptedJob.id)).failureCode,'interrupted');assert.equal(creates,1);passed('interrupted provider create is held for reconciliation instead of duplicated');
  const configuration=await fixture(),configurationJob=await delivery.request('sender','delivery-org',configuration.approval);
  let configurationCalls=0;const brokenConfig=documentDelivery({...dependencies,provider:{...provider,configureDraft:async()=>{configurationCalls++;throw Error('Uncertain field update');}}});
  await brokenConfig.runOnce();assert.equal((await delivery.status('sender','delivery-org',configurationJob.id)).status,'needs_review');
  const configuredCreates=creates;await delivery.runOnce();assert.equal(configurationCalls,1);assert.equal(creates,configuredCreates);passed('uncertain field configuration is retained for review without recreation or activation');
  const uncertain=await fixture(),uncertainJob=await delivery.request('sender','delivery-org',uncertain.approval);
  const flaky=documentDelivery({...dependencies,mailer:{send:async message=>{await smtp.send(message);throw Error('Timeout after acceptance');}}});await flaky.runOnce();assert.equal((await delivery.status('sender','delivery-org',uncertainJob.id)).status,'needs_review');assert.equal((await messages()).length,3);await delivery.runOnce();assert.equal((await messages()).length,3);passed('timeout after SMTP acceptance stays uncertain and does not automatically resend');
  const removed=await fixture(),removedJob=await delivery.request('sender','delivery-org',removed.approval);const before=creates;await pool.query("UPDATE gc_atrium.member SET role='member' WHERE id='sender-member'");await delivery.runOnce();await pool.query("UPDATE gc_atrium.member SET role='owner' WHERE id='sender-member'");assert.equal(creates,before);assert.equal((await delivery.status('sender','delivery-org',removedJob.id)).status,'needs_review');passed('removed staff privileges stop queued sends before external writes');
  const publicDb=new pg.Client({host:'database',database:'foundation_test',user:'gc_gateway',password:readFileSync('/gateway-credential/password','utf8').trim(),ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true},options:'-c search_path=gc_atrium,pg_catalog'});
  await publicDb.connect();try{
   for(const sql of ['SELECT binding_ciphertext FROM guest_send','INSERT INTO grants DEFAULT VALUES','UPDATE grants SET generation=generation+1','DELETE FROM pin_shares',"SELECT gc_atrium.publish_guest_completion('00000000-0000-4000-8000-000000000000','item','data',repeat('0',64),8)"])await assert.rejects(()=>publicDb.query(sql),error=>error.code==='42501');
   assert.equal((await publicDb.query('SELECT gc_atrium.guest_gateway_active($1) AS allowed',[randomUUID()])).rows[0].allowed,false);
  }finally{await publicDb.end();}passed('recipient gateway cannot read send secrets, issue/rotate grants or publish completion');
  const linkOnly=await fixture(undefined,false),beforeLinkMail=(await messages()).length;
  await assert.rejects(()=>flow.approve('sender','delivery-org',{version:linkOnly.version.id,recipient:linkOnly.recipient,fields:linkOnly.preview.message.signing.fields,requirePin:true,previewSha256:linkOnly.preview.previewSha256,expiresAt:new Date(Date.now()+3600000).toISOString()}));
  const linkJob=await delivery.request('sender','delivery-org',linkOnly.approval);await delivery.runOnce();
  const linkRow=(await pool.query('SELECT * FROM gc_atrium.guest_send WHERE id=$1',[linkJob.id])).rows[0];assert.equal(linkRow.status,'sent');assert.equal((await messages()).length,beforeLinkMail+1);
  const linkAccess=secrets.open(linkRow.id,linkRow.access_ciphertext),linkMail=deliveryMessages(linkOnly.preview,linkAccess,dependencies.signingOrigin,linkRow.id);assert.equal(linkMail.pin,undefined);assert.ok(linkMail.document.text.includes('No PIN'));
  const linkHandoff=await gatewayAdapter.pinAccess.unlock(linkAccess.share,'','link-test');assert.ok(linkHandoff);const linkSession=await gatewayAdapter.store.redeem(linkHandoff);assert.equal(linkSession.binding.pinRequired,false);
  await flow.revoke('sender','delivery-org',linkRow.dispatch_id);assert.equal(await gatewayAdapter.pinAccess.unlock(linkAccess.share,'','link-test'),null);assert.equal(await gatewayAdapter.store.authorize(linkSession.token),null);
  passed('optional PIN is approval-bound, sends one email, opens without a code and obeys revocation');
  const browserDocument=await fixture([{type:'SIGNATURE',label:'Signature',required:true,page:1,positionX:10,positionY:20,width:40,height:10},{type:'TEXT',label:'Company name',required:true,page:1,positionX:10,positionY:45,width:40,height:8}]),browserJob=await delivery.request('sender','delivery-org',browserDocument.approval);await delivery.runOnce();
  const browserRow=(await pool.query('SELECT * FROM gc_atrium.guest_send WHERE id=$1',[browserJob.id])).rows[0];assert.equal(browserRow.status,'sent');
  writeFileSync('/provider-runtime/delivery-browser.json',JSON.stringify({sendId:browserRow.id,encryptionKey:encryptionKey.toString('hex'),binding:secrets.open(browserRow.id,browserRow.binding_ciphertext),access:secrets.open(browserRow.id,browserRow.access_ciphertext)}),{mode:0o600});
  writeFileSync('/delivery-evidence.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,passed:checks.length,realLocalSmtp:true,taggedPdfSource:true,recipientGatewayRole:'gc_gateway',provider:actualProvider?'real pinned Documenso':'controlled adapter',cloudWrites:0,customerEmails:0},null,2)+'\n');
 }finally{await gatewayStore.pool.end();await pool.end();}
}
