import 'reflect-metadata';
import {PrismaService} from './dist/prisma/prisma.service';
import {createApiRuntime} from './api-runtime.mjs';
import pg from '../../gateway/node_modules/pg/lib/index.js';
import {generateKeyPairSync,sign} from 'node:crypto';
import {guard as schemaGuard} from '../../gateway/foundation/migrate.mjs';
import {verifyReceipt} from './proof.mjs';
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { createStore, digest } from '../../gateway/src/store.mjs';
import { authorizeAccount } from './claims.mjs';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { enqueueCompletion, runReconciliation } from './lifecycle.mjs';
import { reconcileCompletion } from './completion.mjs';
import { providerFixture } from './provider-fixture.mjs';

const db = new PrismaService(); // Privileged test driver: fixture setup and failure injection only.
const applicationUrl=new URL(process.env.DATABASE_URL);applicationUrl.username='gc_app';applicationUrl.password=readFileSync('/app-credentials/password','utf8').trim();
const localSideEffects={storage:0,stripe:0,notifications:0};
const browserMode=process.env.PORTAL_BROWSER==='1';
const origin=browserMode?'https://portal.growthcast.test:8444':'http://localhost:3001';
const runtime=createApiRuntime({authSecret:readFileSync('/auth-credentials/secret','utf8').trim(),databaseUrl:applicationUrl.href,browserMode,origin,onMail:()=>{throw Error('Unexpected direct-service mail');},sideEffects:localSideEffects});
const {db:applicationDb,store:applicationStore,claims,docs,payments,invoicePdf}=runtime;
const store=createStore(process.env.DATABASE_URL,{authorizeAccount});
const workerUrl=new URL(process.env.DATABASE_URL);workerUrl.username='gc_lifecycle';workerUrl.password=readFileSync('/worker-credentials/password','utf8').trim();
const worker=createStore(workerUrl.href);
const sideEffects=Object.defineProperties({},Object.fromEntries(Object.keys(localSideEffects).map(key=>[key,{enumerable:true,get(){return localSideEffects[key]+JSON.parse(readFileSync('/api-evidence/side-effects.json','utf8'))[key];}}])));
let document,source,unverified,otherClient,otherOrg,owner,ownedDoc,ownedInvoice,nativeDoc,nativeInvoice,oldToken,catalogDoc,catalogEvidence,catalogBinding;

async function request(path, actor, body, extras = {}) {
  const { method: forcedMethod, ...extraHeaders } = extras;
  const headers = { Origin: origin, ...extraHeaders };
  if (actor) {
    headers.Cookie = [...actor.cookies].map(([k,v]) => `${k}=${v}`).join('; ');
    headers['x-csrf-token'] = actor.cookies.get('csrf-token') || '';
  }
  const response = await fetch('http://api:3001' + path, { method: forcedMethod || (body === undefined ? 'GET' : 'POST'),
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  if (actor) for (const value of response.headers.getSetCookie()) {
    const cookie = value.split(';')[0], separator = cookie.indexOf('=');
    actor.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return response;
}
async function actor(email, org, project, verify) {
  const result = { cookies: new Map(), email };
  await db.invitation.create({ data: { id: email, organizationId: org, inviterId: 'http-owner', email, role: 'member', status: 'pending', expiresAt: new Date(Date.now()+3600000) } });
  const signup = await request('/api/auth/sign-up/email', result, { name: 'Synthetic', email, password: 'synthetic-password-1234' });
  expect(signup.status).toBe(200);
  const data = await signup.json(); result.id = data.user.id;
  await db.member.create({ data: { id: email, organizationId: org, userId: result.id, role: 'member' } });
  await db.projectClient.create({ data: { projectId: project, userId: result.id } });
  expect((await request('/api/auth/organization/set-active', result, { organizationId: org })).status).toBe(200);
  if (verify) {
    await verifyEmail(result);
    expect((await request('/api/auth/organization/set-active', result, { organizationId: org })).status).toBe(200);
  }
  // Auth routes invalidate the middleware cache after active-org changes.
  expect((await request('/api/auth/get-session', result)).status).toBe(200);
  return result;
}
async function verifyEmail(actor) {
  const link = readFileSync('/api-evidence/mail-'+digest(actor.email)+'.html','utf8')?.match(/https?:[^"<> ]+\/api\/auth\/verify-email[^"<> ]+/)?.[0].replaceAll('&amp;', '&');
  expect(Boolean(link)).toBe(true);
  const res = await request(new URL(link).pathname + new URL(link).search, actor);
  expect([200,302]).toContain(res.status);
  expect((await db.user.findUnique({ where: { id: actor.id } })).emailVerified).toBe(true);
}
const claim = (token, who = unverified, extras) => request('/api/portal/claim', who, { claim: token }, extras);
const provision = () => claims.provision(source.id, document.id);
beforeAll(async () => {
  await schemaGuard(applicationStore.pool);
  await db.$connect();
  for (const id of ['http-org','http-other']) await db.organization.create({ data: { id, name: id==='http-org'?'GrowthCast':id, slug: id } });
  await db.user.create({ data: { id: 'http-owner', name: 'Owner', email: 'http-owner@example.test', emailVerified: true } });
  for (const [id, org] of [['http-project','http-org'], ['http-project-other','http-org'], ['http-project-org2','http-other']])
    await db.project.create({ data: { id, organizationId: org, name: id } });
  const deadline=Date.now()+30000;
  while(!existsSync('/api-evidence/ready.json')) {
    if(Date.now()>deadline)throw Error('Isolated API startup deadline');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const evidence=JSON.parse(readFileSync('/api-evidence/ready.json','utf8'));
  expect(evidence).toEqual({databaseRole:'gc_app',tls:true,privilegedCredentialsAbsent:true});
  expect(()=>writeFileSync('/api-evidence/driver-write-probe','forbidden')).toThrow();
  unverified = await actor('client@growthcast.invalid', 'http-org', 'http-project', false);
  otherClient = await actor('http-other-client@example.test', 'http-org', 'http-project-other', true);
  otherOrg = await actor('http-other-org@example.test', 'http-other', 'http-project-org2', true);
  const file = await db.file.create({ data: { filename: 'synthetic.pdf', projectId: 'http-project', organizationId: 'http-org', uploadedById: 'http-owner' } });
  document = await db.document.create({ data: { title: 'Synthetic completed fixture', type: 'contract', status: 'signed', fileId: file.id, projectId: 'http-project', organizationId: 'http-org', uploadedById: 'http-owner' } });
  source = await store.issue({ environment: 'local-test', organizationId: 'http-org', clientId: 'http-project',
    documentVersion: document.id + '-v1', envelopeId: 'synthetic-envelope', documentId: 1, recipientId: 1,
    recipientToken: 'synthetic-recipient', recipientName: 'Synthetic', recipientEmail: unverified.email,
    fieldIds: [], items: [{ id: 'synthetic-item', dataId: 'synthetic-data' }] });
}, 30000);
afterAll(async () => {
  try {
    if(browserMode && catalogDoc) {
      writeFileSync('/runtime/browser-ready.json',JSON.stringify({documentId:catalogDoc.id,recipientToken:catalogBinding.recipientToken,envelopeId:catalogBinding.envelopeId,...catalogEvidence,provider:process.env.PORTAL_PROVIDER==='1'}));
      const deadline=Date.now()+240000;
      while(!existsSync('/runtime/browser-done')) {
        if(Date.now()>deadline)throw Error('Browser fixture deadline');
        await new Promise(resolve=>setTimeout(resolve,500));
      }
    }
  } finally {await runtime.close();await db.$disconnect();await store.pool.end();await worker.pool.end();}
},250000);

test('verification mail reaches only the isolated SMTP capture service', async () => {
  const response=await fetch('http://mail:1080/email');
  expect(response.ok).toBe(true);
  const messages=await response.json();
  expect(messages.length).toBeGreaterThanOrEqual(3);
  for(const message of messages){
    expect(message.from[0].address).toBe('portal@growthcast.invalid');
    for(const recipient of message.to)expect(/@(example\.test|growthcast\.invalid)$/.test(recipient.address)).toBe(true);
  }
  expect(messages.some(message=>message.to.some(recipient=>recipient.address==='client@growthcast.invalid'))).toBe(true);
});

test('HTTP anonymous, wrong origin and missing CSRF fail closed', async () => {
  const token = await provision();
  expect((await request('/api/portal/claim', unverified, { claim: [token] })).status).toBe(403);
  expect((await request('/api/portal/claim', unverified, { claim: token, recipient: 'other' })).status).toBe(403);
  expect((await claim(token, null)).status).toBe(401);
  expect((await claim(token, unverified, { Origin: 'https://evil.invalid' })).status).toBe(403);
  const cookie = unverified.cookies.get('csrf-token');
  unverified.cookies.delete('csrf-token');
  expect((await claim(token)).status).toBe(403);
  unverified.cookies.set('csrf-token', cookie);
});
test('HTTP unverified account, other client and other organization cannot consume claim', async () => {
  const token = await provision();
  for (const who of [unverified,otherClient,otherOrg]) {
    const response = await claim(token, who);
    expect({ actor: who.email, status: response.status }).toEqual({ actor: who.email, status: 403 });
  }
  const result = await store.pool.query('SELECT consumed_at FROM portal_claims WHERE token_hash=$1',[digest(token)]);
  expect(result.rows[0].consumed_at).toBeNull();
});
test('real email verification allows one atomic claim and one gateway handoff redemption', async () => {
  await verifyEmail(unverified);
  const token = await provision();
  const responses = await Promise.all([claim(token),claim(token)]);
  expect(responses.map(r=>r.status).sort()).toEqual([201,403]);
  const response = responses.find(r=>r.status===201);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const { handoff } = await response.json();
  const gatewaySession = await store.redeem(handoff);
  expect(gatewaySession.binding.recipientEmail).toBe(unverified.email);
  expect(await store.redeem(handoff)).toBeNull();
  expect((await store.authorize(gatewaySession.token)).binding.organizationId).toBe('http-org');
  const audit = await store.pool.query('SELECT * FROM portal_claim_audit WHERE claim_hash=$1',[digest(token)]);
  expect(audit.rowCount).toBe(1);
  expect(audit.rows[0].user_id).toBe(unverified.id);
});
test('account grants fail closed when gateway lacks account validator', async () => {
  const response = await claim(await provision());
  const { handoff } = await response.json();
  const bare = createStore(process.env.DATABASE_URL);
  try { expect(await bare.redeem(handoff)).toBeNull(); } finally { await bare.pool.end(); }
  expect(await store.redeem(handoff)).not.toBeNull();
});
test('removed project assignment denies HTTP despite warm middleware cache and invalidates gateway session', async () => {
  const { handoff } = await (await claim(await provision())).json();
  const session = await store.redeem(handoff);
  const pending = await provision();
  await db.projectClient.deleteMany({ where: { userId: unverified.id, projectId: 'http-project' } });
  expect((await claim(pending)).status).toBe(403);
  expect(await store.authorize(session.token)).toBeNull();
  await db.projectClient.create({ data: { userId: unverified.id, projectId: 'http-project' } });
});
test('source replacement invalidates outstanding claims and existing gateway sessions', async () => {
  const token = await provision();
  const { handoff } = await (await claim(await provision())).json();
  const session = await store.redeem(handoff);
  await db.document.update({ where: { id: document.id }, data: { currentVersion: 2 } });
  expect((await claim(token)).status).toBe(403);
  expect(await store.authorize(session.token)).toBeNull();
  await db.document.update({ where: { id: document.id }, data: { currentVersion: 1 } });
});
async function gateway(handoff) {
  const response = await fetch('http://gateway:8080/session', { method: 'POST', headers: { Origin: 'https://gateway:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ handoff }) });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  return () => fetch('http://gateway:8080/api/files/token/synthetic-recipient/envelope/synthetic-envelope/envelopeItem/synthetic-item/dataId/synthetic-data/current/item.pdf', { headers: { Cookie: cookie } });
}
test('expired claim is rejected without a consume or audit row', async () => {
  const token = await provision();
  await store.pool.query('UPDATE portal_claims SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1',[digest(token)]);
  expect((await claim(token)).status).toBe(403);
  expect((await store.pool.query('SELECT * FROM portal_claim_audit WHERE claim_hash=$1',[digest(token)])).rowCount).toBe(0);
});
test('real gateway HTTP download denies removed organization membership immediately', async () => {
  const { handoff } = await (await claim(await provision())).json();
  const download = await gateway(handoff);
  const initial = await download();
  expect(initial.status).toBe(200);
  expect(initial.headers.get('cache-control')).toBe('private, no-store');
  const member = await db.member.findUnique({ where: { id: unverified.email } });
  await db.member.delete({ where: { id: member.id } });
  expect((await download()).status).toBe(404);
  expect((await claim(await provision())).status).toBe(403);
  await db.member.create({ data: member });
});
test('real gateway HTTP download denies expired Atrium session despite warm cache', async () => {
  const { handoff } = await (await claim(await provision())).json();
  const download = await gateway(handoff);
  expect((await download()).status).toBe(200);
  const sessions = await db.session.findMany({ where: { userId: unverified.id } });
  await db.session.updateMany({ where: { userId: unverified.id }, data: { expiresAt: new Date(0) } });
  expect((await download()).status).toBe(404);
  expect((await claim(await provision())).status).toBe(403);
  for (const session of sessions) await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt } });
});
test('real gateway HTTP download denies same-version file substitution', async () => {
  const { handoff } = await (await claim(await provision())).json();
  const download = await gateway(handoff);
  expect((await download()).status).toBe(200);
  const replacement = await db.file.create({ data: { filename: 'replacement.pdf', projectId: 'http-project', organizationId: 'http-org', uploadedById: 'http-owner' } });
  await db.document.update({ where: { id: document.id }, data: { fileId: replacement.id } });
  expect((await download()).status).toBe(404);
  await db.document.update({ where: { id: document.id }, data: { fileId: document.fileId } });
});
test('revoked source grant denies HTTP claim and previously issued gateway session', async () => {
  const token = await provision();
  const { handoff } = await (await claim(await provision())).json();
  const session = await store.redeem(handoff);
  await store.revoke(source.id);
  expect((await claim(token)).status).toBe(403);
  expect(await store.authorize(session.token)).toBeNull();
});


test('provider registration is durable; native records remain usable', async () => {
  owner = await actor('http-staff@example.test','http-org','http-project',true);
  await db.member.update({ where: { id: owner.email }, data: { role: 'owner' } });
  await request('/api/auth/get-session',owner);
  for (const provider of [false,true]) {
    const file = await db.file.create({ data: { filename: 'native-boundary.pdf', storageKey: 'synthetic-object', projectId: 'http-project', organizationId: 'http-org', uploadedById: owner.id } });
    const doc = await db.document.create({ data: { title: 'Native boundary', type: 'contract', status: 'pending', fileId: file.id, projectId: 'http-project', organizationId: 'http-org', uploadedById: owner.id } });
    const invoice = await db.invoice.create({ data: { invoiceNumber: 'HTTP-'+provider, projectId: 'http-project', organizationId: 'http-org', status: 'sent', lineItems: { create: { description: 'Synthetic', unitPrice: 1000, quantity: 1 } } } });
    if (provider) {
      ownedDoc=doc; ownedInvoice=invoice;
      oldToken = await docs.generateAccessToken(doc.id,unverified.id,'http-org');
      await store.pool.query("INSERT INTO provider_documents VALUES($1,'documenso','envelope-owned')",[doc.id]);
      await store.pool.query("INSERT INTO provider_invoices VALUES($1,'stripe-invoicing','in_owned')",[invoice.id]);
    } else { nativeDoc=doc; nativeInvoice=invoice; }
  }
  expect((await request('/api/documents/'+nativeDoc.id,owner)).status).toBe(200);
  expect((await request('/api/documents/'+nativeDoc.id+'/generate-access-token',owner,{userId:unverified.id})).status).toBe(201);
  expect((await request('/api/invoices/'+nativeInvoice.id,owner,{status:'overdue'},{method:'PUT'})).status).toBe(200);
});
test('real document controller blocks all owned ID actions before upload/signing/storage', async () => {
  const paths = [
    ['GET',''],['GET','/view'],['HEAD','/view'],['GET','/signing-info'],['GET','/certificate'],['GET','/versions'],
    ['POST','/sign'],['POST','/respond'],['POST','/send'],['POST','/void'],['POST','/upload-version'],
    ['PUT','/signature-fields'],['POST','/restore-version/unknown'],['POST','/generate-access-token'],['DELETE',''],
  ];
  for (const [method,suffix] of paths) {
    const response = await request('/api/documents/'+ownedDoc.id+suffix,owner,['GET','HEAD'].includes(method)?undefined:{},{method});
    expect({method,suffix,status:response.status}).toEqual({method,suffix,status:404});
  }
  expect(sideEffects.storage).toBe(0);
});
test('pre-existing native bearer tokens cannot expose provider metadata, PDF or signing', async () => {
  for (const suffix of ['', '/view','/signing-info','/sign']) {
    const response = await request('/api/documents/sign-via-token/'+oldToken.token+suffix,null,suffix==='/sign'?{}:undefined);
    expect(response.status).toBe(404);
  }
});
test('real file controller blocks direct provider file download, URL and mutation', async () => {
  for (const [method,suffix] of [['GET','/download'],['HEAD','/download'],['GET','/url'],['PATCH',''],['DELETE','']]) {
    const response = await request('/api/files/'+ownedDoc.fileId+suffix,owner,['GET','HEAD'].includes(method)?undefined:{},{method});
    expect(response.status).toBe(404);
  }
  expect(sideEffects.storage).toBe(0);
});
test('real invoice and payment controllers deny native collection and manual paid state', async () => {
  for (const [method,path] of [['PUT','/api/invoices/'],['DELETE','/api/invoices/'],['GET','/api/invoices/mine/'],['POST','/api/payments/checkout/']]) {
    expect((await request(path+ownedInvoice.id,owner,method==='GET'?undefined:{status:'paid'},{method})).status).toBe(404);
  }
  for (const prefix of ['/api/invoices/','/api/invoices/mine/']) expect((await request(prefix+ownedInvoice.id+'/pdf',owner)).status).toBe(404);
  expect(sideEffects.stripe).toBe(0);
  expect((await db.invoice.findUnique({where:{id:ownedInvoice.id}})).status).toBe('sent');
});
test('service workers cannot create Checkout or project native payment events for owned invoices', async () => {
  await expect(payments.createCheckoutSession(ownedInvoice.id,unverified.id,'http-org',origin+'/paid',origin+'/cancel')).rejects.toThrow('Resource unavailable');
  for (const type of ['checkout.session.completed','checkout.session.expired'])
    await expect(payments.handleWebhookEvent({type,data:{object:{metadata:{invoiceId:ownedInvoice.id,organizationId:'http-org'},amount_total:1000}}},'http-org')).rejects.toThrow('Resource unavailable');
  await expect(invoicePdf.generate(ownedInvoice.id,'http-org')).rejects.toThrow('Resource unavailable');
  await expect(docs.uploadVersion(ownedDoc.id,'http-org',owner.id,{})).rejects.toThrow('Resource unavailable');
  expect(sideEffects.stripe).toBe(0);
  expect(sideEffects.storage).toBe(0);
  expect(sideEffects.notifications).toBe(0);
});
test('database rejects ownership removal, native state writes and child-record reparenting', async () => {
  await expect(store.pool.query('DELETE FROM provider_documents WHERE document_id=$1',[ownedDoc.id])).rejects.toThrow('immutable');
  await expect(Promise.resolve(db.document.update({where:{id:ownedDoc.id},data:{status:'signed'}}))).rejects.toThrow('read only');
  await expect(Promise.resolve(db.invoice.update({where:{id:ownedInvoice.id},data:{status:'paid'}}))).rejects.toThrow('read only');
  await expect(Promise.resolve(db.file.update({where:{id:ownedDoc.fileId},data:{storageKey:'replacement'}}))).rejects.toThrow('read only');
  await expect(Promise.resolve(db.documentResponse.create({data:{documentId:ownedDoc.id,userId:unverified.id,action:'signed'}}))).rejects.toThrow('read only');
  await expect(Promise.resolve(db.signatureField.create({data:{documentId:ownedDoc.id,pageNumber:0,x:0,y:0,width:0.1,height:0.1}}))).rejects.toThrow('read only');
  const item = await db.invoiceLineItem.findFirst({where:{invoiceId:ownedInvoice.id}});
  await expect(Promise.resolve(db.invoiceLineItem.update({where:{id:item.id},data:{invoiceId:nativeInvoice.id}}))).rejects.toThrow('read only');
  await expect(Promise.resolve(db.documentAccessToken.create({data:{documentId:ownedDoc.id,userId:unverified.id,token:'synthetic-new-token',expiresAt:new Date(Date.now()+60000)}}))).rejects.toThrow('read only');
});
test('ordinary native Checkout still reaches the synthetic Stripe transport', async () => {
  await db.systemSettings.create({data:{organizationId:'http-org',stripeConnectEnabled:true,stripeConnectAccountId:'acct_http'}});
  const response = await request('/api/payments/checkout/'+nativeInvoice.id,owner,{successUrl:origin+'/paid',cancelUrl:origin+'/cancel'});
  expect(response.status).toBe(201);
  expect(sideEffects.stripe).toBe(1);
});

test('ownership lookup outage denies requests before native side effects', async () => {
  const before = { ...sideEffects };
  await store.pool.query('ALTER TABLE provider_documents RENAME TO provider_documents_unavailable');
  try {
    const response = await request('/api/documents/'+ownedDoc.id+'/upload-version',owner,{});
    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe('Internal server error');
    expect(sideEffects).toEqual(before);
  } finally {
    await store.pool.query('ALTER TABLE provider_documents_unavailable RENAME TO provider_documents');
  }
});

test('full application catalog exposes only claimed provider documents without provider tokens or files', async () => {
  const file=await db.file.create({data:{filename:'catalog.pdf',projectId:'http-project',organizationId:'http-org',uploadedById:owner.id}});
  catalogDoc=await db.document.create({data:{title:'GrowthCast synthetic agreement',type:'contract',status:'pending',fileId:file.id,projectId:'http-project',organizationId:'http-org',uploadedById:owner.id}});
  const fixture=providerFixture(unverified.email);
  catalogBinding={...fixture.binding,organizationId:'http-org',clientId:'http-project',documentVersion:catalogDoc.id+'-v1'};
  await store.pool.query("INSERT INTO provider_documents VALUES($1,'documenso',$2)",[catalogDoc.id,catalogBinding.envelopeId]);
  const grant=await store.issue(catalogBinding);
  await expect(claims.provision(grant.id,catalogDoc.id)).rejects.toThrow('No approved completed document binding');
  const jobInput={grantId:grant.id,documentId:catalogDoc.id,teamId:fixture.teamId,verifiedSha256:fixture.verifiedSha256};
  await enqueueCompletion(store.pool,jobInput);
  await enqueueCompletion(store.pool,jobInput);
  await expect(enqueueCompletion(store.pool,{...jobInput,verifiedSha256:'0'.repeat(64)})).rejects.toThrow('immutable');
  const job=(await worker.pool.query('SELECT public.lifecycle_claim() AS job')).rows[0].job;
  const input={...fixture,store:worker,grantId:grant.id,approved:catalogBinding,leaseToken:job.lease_token};
  for(const mutate of [e=>{e.status='REJECTED';},e=>{e.teamId=-1;},e=>{e.id='another-envelope';},e=>{e.secondaryId='document_999999';},e=>{e.recipients[0].signingStatus='PENDING';},e=>{e.recipients.find(r=>r.id===catalogBinding.recipientId).email='wrong@example.test';},e=>{e.envelopeItems[0].id='another-item';}]) {
    await expect(reconcileCompletion({...input,api:async path=>{
      const response=await fixture.api(path);
      if(path.endsWith('/download'))return response;
      const envelope=await response.json();mutate(envelope);return Response.json(envelope);
    }})).rejects.toThrow();
  }
  await expect(reconcileCompletion({...input,verifiedSha256:'0'.repeat(64)})).rejects.toThrow();
  expect((await store.pool.query('SELECT * FROM provider_completions WHERE grant_id=$1',[grant.id])).rows).toEqual([]);
  const revoked=await store.issue(catalogBinding);
  await store.revoke(revoked.id);
  await enqueueCompletion(store.pool,{...jobInput,grantId:revoked.id});
  const revokedJob=(await worker.pool.query('SELECT public.lifecycle_claim() AS job')).rows[0].job;
  await expect(reconcileCompletion({...input,grantId:revoked.id,leaseToken:revokedJob.lease_token})).rejects.toThrow('Current approved portal binding required');
  await store.pool.query("UPDATE lifecycle_jobs SET state='dead',lease_token=NULL,lease_until=NULL WHERE grant_id=$1",[revoked.id]);
  expect((await store.pool.query('SELECT * FROM sealed_artifacts WHERE grant_id=$1',[revoked.id])).rows).toEqual([]);
  await worker.pool.query('SELECT public.lifecycle_retry($1,$2)',[grant.id,job.lease_token]);
  await store.pool.query('UPDATE lifecycle_jobs SET available_at=now() WHERE grant_id=$1',[grant.id]);
  // Only this selected provider credential and public receipt material cross
  // into the worker's read-only configuration volume. Never owner/signing keys.
  const {api: _api,...workerConfig}=fixture;
  void _api;
  writeFileSync('/worker-config/provider.json',JSON.stringify(workerConfig),{mode:0o644});
  writeFileSync('/worker-control/ready','ready');
  const deadline=Date.now()+20000;
  while(!existsSync('/worker-control/result.json')) {
    if(Date.now()>deadline)throw Error('Isolated worker did not complete');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  expect(JSON.parse(readFileSync('/worker-control/result.json','utf8'))).toEqual({state:'done',isolated:true});
  const artifact=(await store.pool.query('SELECT item_id,data_id,sha256 FROM sealed_artifacts WHERE grant_id=$1',[grant.id])).rows[0];
  catalogEvidence={itemId:artifact.item_id,dataId:artifact.data_id,sha256:artifact.sha256};
  await enqueueCompletion(store.pool,jobInput);
  expect(await runReconciliation(worker.pool,async()=>fixture.api)).toEqual({state:'idle'});
  await expect(reconcileCompletion(input)).rejects.toThrow('Current lifecycle lease required');
  expect((await db.document.findUnique({where:{id:catalogDoc.id}})).status).toBe('pending');
  await expect(store.pool.query('DELETE FROM provider_completions WHERE grant_id=$1',[grant.id])).rejects.toThrow('immutable');
  const token=await claims.provision(grant.id,catalogDoc.id);
  expect((await claim(token)).status).toBe(201);
  const response=await request('/api/portal/catalog',unverified);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{id:catalogDoc.id,title:catalogDoc.title,type:'contract',status:'Completed'}]);
  for(const who of [otherClient,otherOrg])expect(await (await request('/api/portal/catalog',who)).json()).toEqual([]);
  const opened=await request('/api/portal/catalog/'+catalogDoc.id+'/open',unverified,{});
  expect(opened.status).toBe(201);
  expect(await store.redeem((await opened.json()).handoff)).not.toBeNull();
  expect((await request('/api/portal/catalog/'+catalogDoc.id+'/open',otherClient,{})).status).toBe(403);
}, 30000);
test('catalog and reopen deny removed project access even with cached identity', async () => {
  await db.projectClient.deleteMany({where:{userId:unverified.id,projectId:'http-project'}});
  expect(await (await request('/api/portal/catalog',unverified)).json()).toEqual([]);
  expect((await request('/api/portal/catalog/'+catalogDoc.id+'/open',unverified,{})).status).toBe(403);
  await db.projectClient.create({data:{userId:unverified.id,projectId:'http-project'}});
});


test('lifecycle role cannot bypass the queue, mutate native tables, change proof or escalate', async()=>{
  expect((await worker.pool.query('SELECT current_user')).rows[0].current_user).toBe('gc_lifecycle');
  for(const sql of ['SELECT * FROM "user"','SELECT * FROM grants','SELECT * FROM lifecycle_jobs',
    "UPDATE document SET title='changed'",'DELETE FROM provider_completions','DELETE FROM sealed_artifacts',
    "UPDATE lifecycle_jobs SET verified_sha256=repeat('0',64)","INSERT INTO provider_completions SELECT * FROM provider_completions",
    'SET ROLE postgres','CREATE TABLE public.worker_escape(id int)'])
    await expect(worker.pool.query(sql)).rejects.toThrow();
  const functions=await store.pool.query("SELECT proname,proacl::text AS acl FROM pg_proc WHERE proname IN ('lifecycle_claim','lifecycle_retry','lifecycle_complete')");
  expect(functions.rows.length).toBe(3);
  for(const row of functions.rows)expect(row.acl.includes(',=X/')||row.acl.startsWith('{=X/')).toBe(false);
});
async function queuedFixture() {
  const fixture=providerFixture(unverified.email),grant=await store.issue(catalogBinding);
  await enqueueCompletion(store.pool,{grantId:grant.id,documentId:catalogDoc.id,teamId:fixture.teamId,verifiedSha256:fixture.verifiedSha256});
  return {fixture,grant};
}
test('durable lease survives connection loss, excludes concurrent workers and fences stale completion',async()=>{
  const {fixture,grant}=await queuedFixture();
  const transient=createStore(workerUrl.href),competitor=createStore(workerUrl.href);
  const results=await Promise.all([transient.pool.query('SELECT public.lifecycle_claim() AS job'),competitor.pool.query('SELECT public.lifecycle_claim() AS job')]);
  const jobs=results.map(r=>r.rows[0].job).filter(Boolean);
  expect(jobs.length).toBe(1);expect(jobs[0].grant_id).toBe(grant.id);
  await Promise.all([transient.pool.end(),competitor.pool.end()]);
  await store.pool.query("UPDATE lifecycle_jobs SET lease_until=now()-interval '1 second' WHERE grant_id=$1",[grant.id]);
  const next=(await worker.pool.query('SELECT public.lifecycle_claim() AS job')).rows[0].job;
  expect(next.lease_token).not.toBe(jobs[0].lease_token);expect(next.attempts).toBe(2);
  const input={...fixture,store:worker,grantId:grant.id,approved:catalogBinding};
  await expect(reconcileCompletion({...input,leaseToken:jobs[0].lease_token})).rejects.toThrow('Current lifecycle lease required');
  expect((await worker.pool.query('SELECT public.lifecycle_retry($1,$2) AS ok',[grant.id,jobs[0].lease_token])).rows[0].ok).toBe(false);
  await expect(worker.pool.query('SELECT public.lifecycle_complete($1,$2,$3,$4,$5,$6)',[grant.id,next.lease_token,catalogBinding,catalogEvidence.itemId,catalogEvidence.dataId,'0'.repeat(64)])).rejects.toThrow('Approved sealed artifact required');
  expect((await store.pool.query('SELECT * FROM provider_completions WHERE grant_id=$1',[grant.id])).rows).toEqual([]);
  expect(await reconcileCompletion({...input,leaseToken:next.lease_token})).toEqual(catalogEvidence);
  expect((await store.pool.query('SELECT state,attempts FROM lifecycle_jobs WHERE grant_id=$1',[grant.id])).rows[0]).toEqual({state:'done',attempts:2});
},30000);
test('readback outage backs off durably, redacts failures and stops after five attempts',async()=>{
  const {grant}=await queuedFixture();
  for(let attempt=1;attempt<=5;attempt++) {
    expect(await runReconciliation(worker.pool,async()=>{throw Error('synthetic-secret-must-not-be-stored');})).toEqual({state:'retry'});
    const row=(await store.pool.query('SELECT state,attempts,last_error,available_at>now() AS delayed FROM lifecycle_jobs WHERE grant_id=$1',[grant.id])).rows[0];
    expect(row).toEqual({state:attempt===5?'dead':'pending',attempts:attempt,last_error:'readback-failed',delayed:true});
    expect(await runReconciliation(worker.pool,async()=>{throw Error('must not run');})).toEqual({state:'idle'});
    await store.pool.query('UPDATE lifecycle_jobs SET available_at=now() WHERE grant_id=$1',[grant.id]);
  }
  expect((await store.pool.query('SELECT * FROM provider_completions WHERE grant_id=$1',[grant.id])).rows).toEqual([]);
});
test('a stopped final attempt is exhausted rather than leased a sixth time',async()=>{
  const {grant}=await queuedFixture();
  await store.pool.query("UPDATE lifecycle_jobs SET state='processing',attempts=5,lease_until=now()-interval '1 second' WHERE grant_id=$1",[grant.id]);
  expect(await runReconciliation(worker.pool,async()=>{throw Error('must not run');})).toEqual({state:'idle'});
  expect((await store.pool.query('SELECT state FROM lifecycle_jobs WHERE grant_id=$1',[grant.id])).rows[0].state).toBe('dead');
});


test('SCRAM rejects missing, incorrect and cross-role database passwords',async()=>{
  for(const [username,password] of [['gc_lifecycle',''],['gc_lifecycle','incorrect'],['postgres',workerUrl.password]]) {
    const deniedUrl=new URL(workerUrl);deniedUrl.username=username;deniedUrl.password=password;
    const denied=createStore(deniedUrl.href);
    try {await expect(denied.pool.query('SELECT 1')).rejects.toThrow();}
    finally {await denied.pool.end();}
  }
});
test('verification receipts reject tampering, wrong trust keys, stale proof and scope substitution',()=>{
  const fixture=providerFixture(unverified.email);
  expect(verifyReceipt(fixture.receipt,fixture.publicKey,fixture).sha256).toBe(fixture.verifiedSha256);
  expect(()=>verifyReceipt({...fixture.receipt,payload:Buffer.from('{}').toString('base64url')},fixture.publicKey,fixture)).toThrow();
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  expect(()=>verifyReceipt(fixture.receipt,publicKey,fixture)).toThrow();
  const proof=JSON.parse(Buffer.from(fixture.receipt.payload,'base64url'));
  for(const mutation of [{teamId:-1},{envelopeId:'another-envelope'},{itemId:'another-item'},{documentId:999999},{environment:'production'},{audience:'other-service'},{status:'REJECTED'},{expiresAt:Date.now()-1},{issuedAt:Date.now()+60000}]) {
    const payload=Buffer.from(JSON.stringify({...proof,...mutation}));
    const receipt={payload:payload.toString('base64url'),signature:sign(null,payload,privateKey).toString('base64url')};
    expect(()=>verifyReceipt(receipt,publicKey,fixture)).toThrow();
  }
});

test('dedicated HTTP gateway can lock immutable grants but cannot alter authority or canonical data', async () => {
  const gatewayUrl=new URL(process.env.DATABASE_URL);
  gatewayUrl.username='gc_gateway';gatewayUrl.password=readFileSync('/gateway-credentials/password','utf8').trim();
  const gatewayStore=createStore(gatewayUrl.href);
  try {
    expect((await gatewayStore.pool.query('SELECT current_user')).rows[0].current_user).toBe('gc_gateway');
    const connection=await gatewayStore.pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('SELECT id FROM grants WHERE id=$1 FOR UPDATE',[source.id]);
      await connection.query('ROLLBACK');
    } finally {connection.release();}
    for(const sql of [
      "UPDATE grants SET binding=binding || '{\"recipientEmail\":\"forged@example.test\"}'::jsonb WHERE id=$1",
      "UPDATE grants SET expires_at=now()+interval '2 hours' WHERE id=$1",
      'UPDATE grants SET revoked_at=NULL,generation=0 WHERE id=$1',
      'DELETE FROM grants WHERE id=$1',
      'DELETE FROM sealed_artifacts WHERE grant_id=$1',
      'DELETE FROM provider_completions WHERE grant_id=$1',
    ])await expect(gatewayStore.pool.query(sql,[source.id])).rejects.toThrow();
    await expect(gatewayStore.pool.query('SELECT copy_account_artifacts(NULL)')).rejects.toThrow();
    await expect(gatewayStore.pool.query('SET ROLE postgres')).rejects.toThrow();
  } finally {await gatewayStore.pool.end();}
});


test('HTTP application components use non-owner Prisma and gateway-store clients over verified TLS', async () => {
  expect((await applicationDb.$queryRawUnsafe('SELECT current_user')).at(0).current_user).toBe('gc_app');
  expect((await applicationDb.$queryRawUnsafe('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).at(0).ssl).toBe(true);
  expect((await applicationStore.pool.query('SELECT current_user')).rows[0].current_user).toBe('gc_app');
  expect((await applicationStore.pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(true);
  for(const sql of ['CREATE TABLE public.application_escape(id integer)','DELETE FROM provider_completions','DELETE FROM sealed_artifacts','SET ROLE gc_migrate'])await expect(applicationStore.pool.query(sql)).rejects.toThrow();
});


test('combined database rejects plaintext and untrusted TLS connections', async () => {
  const config={host:'database',database:'atrium_test',user:'gc_app',password:readFileSync('/app-credentials/password','utf8').trim(),connectionTimeoutMillis:2000};
  for(const ssl of [false,{rejectUnauthorized:true,ca:[]}]) {
    const connection=new pg.Client({...config,ssl});
    try {await expect(connection.connect()).rejects.toThrow();}finally {await connection.end();}
  }
});
