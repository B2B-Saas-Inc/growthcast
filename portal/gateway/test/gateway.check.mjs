import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { createStore, digest } from '../src/store.mjs';
import { createHandler } from '../src/server.mjs';
import { allowRequest } from '../src/policy.mjs';
import { createPinAccess } from '../src/pin.mjs';
import { randomUUID } from 'node:crypto';

const binding = { environment: 'local-test', organizationId: 'org-test', clientId: 'client-a', documentVersion: 'version-a',
  envelopeId: 'envelope-a', documentId: 11, recipientId: 12, recipientToken: 'token-a', recipientName: 'Test Client',
  recipientEmail: 'client@example.invalid', fieldIds: [21], items: [{ id: 'item-a', dataId: 'data-a' }] };
const store = createStore(process.env.DATABASE_URL);
const otherStore = createStore(process.env.DATABASE_URL);
const documentStore = createStore(process.env.DATABASE_URL,{maxGrantTtl:604800});
let server, upstream, base, sent = 0, lastPath;
const origin = 'https://signing.growthcast.test:8443';
before(async () => {
  await store.pool.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  upstream = http.createServer((req,res) => { sent++; lastPath=req.url; res.writeHead(200, { 'Content-Type': 'application/pdf', 'Set-Cookie': 'provider=unsafe', 'Cache-Control': 'public, max-age=99999' }); res.end('%PDF synthetic'); });
  await new Promise(resolve => upstream.listen(0,'0.0.0.0',resolve));
  server = http.createServer(createHandler({ store, origin, upstream: `http://127.0.0.1:${upstream.address().port}`, assets: new Set() }));
  await new Promise(resolve => server.listen(0,'0.0.0.0',resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); upstream?.close(); await store.pool.end(); await otherStore.pool.end(); await documentStore.pool.end(); });
const path = `/api/files/token/token-a/envelope/envelope-a/envelopeItem/item-a/dataId/data-a/current/item.pdf`;
async function session(b = binding) { const grant = await store.issue(b); return { ...await store.redeem(grant.handoff), grant }; }
function rawFetch(url, options = {}) {
  return new Promise((resolve,reject) => {
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers }, res => {
      const parts = []; res.on('data',p=>parts.push(p)); res.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:res.headers})));
    });
    req.on('error',reject); req.end(options.body);
  });
}
const request = (url, options = {}) => rawFetch(base + url, { ...options, headers: { Host: new URL(origin).host, ...options.headers } });
const rpc = value => JSON.stringify({ json: value });
const pins=createPinAccess(store),otherPins=createPinAccess(otherStore);
async function pinShare() {const grant=await store.issue(binding);return {...await pins.provision(grant.id),grant};}

test('PIN shares use independently salted Argon2id hashes and expose no document metadata', async()=>{
  const a=await pinShare(),b=await pinShare();
  assert.match(a.pin,/^\d{8}$/);
  const rows=(await store.pool.query('SELECT salt,pin_hash FROM pin_shares WHERE grant_id=ANY($1::uuid[])',[[a.grant.id,b.grant.id]])).rows;
  assert.equal(rows.length,2);assert.equal(rows[0].pin_hash.length,32);assert.notDeepEqual(rows[0].salt,rows[1].salt);
  const page=await request('/unlock');assert.equal(page.status,200);
  const html=await page.text();for(const value of [binding.recipientEmail,binding.recipientToken,binding.envelopeId])assert.ok(!html.includes(value));
  assert.equal(page.headers.get('cache-control'),'private, no-store');
});
test('valid PIN creates a one-use scoped handoff; wrong PIN/share cannot',async()=>{
  const p=await pinShare(),source=randomUUID();
  assert.equal(await pins.unlock(p.share,'not a PIN',source),null);
  assert.equal(await pins.unlock('x'.repeat(43),p.pin,source),null);
  const handoff=await pins.unlock(p.share,p.pin,source);
  const redeemed=await store.redeem(handoff);assert.deepEqual(redeemed.binding,binding);
  assert.equal(await store.redeem(handoff),null);
  assert.equal(await store.redeem(p.grant.handoff),null,'Pre-PIN handoff invalidated');
});
test('five-attempt limit is atomic across replicas and expires without permanent lockout',async()=>{
  const p=await pinShare();
  const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?pins:otherPins).unlock(p.share,p.pin,'replica-'+i)));
  assert.equal(results.filter(Boolean).length,5);
  const before=(await store.pool.query("SELECT resets_at FROM pin_attempts WHERE bucket='share:' || $1",[digest(p.share)])).rows[0].resets_at;
  assert.equal(await pins.unlock(p.share,p.pin,randomUUID()),null);
  const after=(await store.pool.query("SELECT resets_at FROM pin_attempts WHERE bucket='share:' || $1",[digest(p.share)])).rows[0].resets_at;
  assert.deepEqual(after,before);
  await store.pool.query("UPDATE pin_attempts SET resets_at=now()-interval '1 second' WHERE bucket='share:' || $1",[digest(p.share)]);
  assert.ok(await otherPins.unlock(p.share,p.pin,randomUUID()));
});
test('source limits span shares and pools, including unknown share attempts',async()=>{
  const source=randomUUID(),p=await pinShare();
  for(let i=0;i<30;i++)await (i%2?pins:otherPins).unlock('z'.repeat(43),'00000000',source);
  assert.equal(await otherPins.unlock(p.share,p.pin,source),null);
  assert.ok(await pins.unlock(p.share,p.pin,randomUUID()));
});
test('PIN rotation invalidates old share, handoffs and established sessions',async()=>{
  const p=await pinShare();
  const session=await store.redeem(await pins.unlock(p.share,p.pin,randomUUID()));
  const pending=await pins.unlock(p.share,p.pin,randomUUID());
  const rotated=await otherPins.provision(p.grant.id);
  assert.equal(await pins.unlock(p.share,p.pin,randomUUID()),null);
  assert.equal(await store.authorize(session.token),null);
  assert.equal(await store.redeem(pending),null);
  assert.ok(await otherPins.unlock(rotated.share,rotated.pin,randomUUID()));
});
test('expired and revoked grants cannot mint PIN handoffs',async()=>{
  const a=await pinShare(),b=await pinShare();
  await store.revoke(a.grant.id);
  await store.pool.query("UPDATE grants SET expires_at=now()-interval '1 second' WHERE id=$1",[b.grant.id]);
  for(const p of [a,b])assert.equal(await pins.unlock(p.share,p.pin,randomUUID()),null);
});
test('PIN HTTP mutations require exact Origin and reject recipient/organization selection',async()=>{
  const p=await pinShare(),body=JSON.stringify({share:p.share,pin:p.pin});
  const h={'Content-Type':'application/json'};
  assert.equal((await request('/unlock',{method:'POST',body,headers:h})).status,403);
  assert.equal((await request('/unlock',{method:'POST',body,headers:{...h,Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await request('/unlock',{method:'POST',body:JSON.stringify({share:p.share,pin:p.pin,organizationId:'other'}),headers:{...h,Origin:origin}})).status,404);
  const r=await request('/unlock',{method:'POST',body,headers:{...h,Origin:origin,'X-Forwarded-For':'forged'}});
  assert.equal(r.status,200);assert.match((await r.json()).path,/^\/enter#[A-Za-z0-9_-]{43}$/);assert.equal(r.headers.get('set-cookie'),null);
});
test('missing distributed PIN limiter fails closed',async()=>{
  const p=await pinShare();
  await store.pool.query('ALTER TABLE pin_attempts RENAME TO unavailable_pin_attempts');
  try {
    const response=await request('/unlock',{method:'POST',body:JSON.stringify({share:p.share,pin:p.pin}),headers:{Origin:origin,'Content-Type':'application/json'}});
    assert.equal(response.status,503);assert.equal(await response.text(),'Signing session unavailable.');
  } finally {await store.pool.query('ALTER TABLE unavailable_pin_attempts RENAME TO pin_attempts');}
});

test('one handoff redeemed concurrently across two pools creates one session', async () => {
  const grant = await store.issue(binding);
  const results = await Promise.all(Array.from({ length: 12 }, (_,i) => (i%2 ? store : otherStore).redeem(grant.handoff)));
  assert.equal(results.filter(Boolean).length,1);
});
test('expired handoff cannot be consumed', async () => {
  const g = await store.issue(binding);
  await store.pool.query('UPDATE handoffs SET expires_at=now()-interval \'1 second\' WHERE grant_id=$1',[g.id]);
  assert.equal(await store.redeem(g.handoff),null);
});
test('revocation immediately invalidates sessions on another pool', async () => {
  const s = await session(); assert.ok(await otherStore.authorize(s.token));
  await store.revoke(s.grant.id); assert.equal(await otherStore.authorize(s.token),null);
});
test('generation change invalidates handoffs and sessions', async () => {
  const s = await session();
  await store.pool.query('UPDATE grants SET generation=generation+1 WHERE id=$1',[s.grant.id]);
  assert.equal(await otherStore.authorize(s.token),null);
});
test('expired session is rejected', async () => {
  const s = await session(); await store.pool.query('UPDATE sessions SET expires_at=now()-interval \'1 second\' WHERE grant_id=$1',[s.grant.id]);
  assert.equal(await store.authorize(s.token),null);
});
test('sessions survive a new store connection', async () => {
  const s = await session(); const reopened = createStore(process.env.DATABASE_URL);
  try { assert.deepEqual((await reopened.authorize(s.token)).binding,binding); } finally { await reopened.pool.end(); }
});
test('database rejects document/client binding reassignment', async () => {
  const s=await session();
  await assert.rejects(()=>store.pool.query('UPDATE grants SET binding=$1 WHERE id=$2',[{...binding,clientId:'other'},s.grant.id]));
  assert.deepEqual((await store.authorize(s.token)).binding,binding);
});
test('grant expiry is enforced even while a session remains unexpired', async () => {
  const s=await session();await store.pool.query('UPDATE grants SET expires_at=now()-interval \'1 second\' WHERE id=$1',[s.grant.id]);
  assert.equal(await otherStore.authorize(s.token),null);
});
test('trusted final artifact reconciliation preserves source binding and rejects reassignment', async () => {
  const s=await session();
  const artifact={id:'item-a',dataId:'sealed-data',sha256:'a'.repeat(64)};
  await assert.rejects(()=>store.recordSealedArtifact(s.grant.id,{...binding,clientId:'other'},artifact));
  await assert.rejects(()=>store.recordSealedArtifact(s.grant.id,binding,{...artifact,id:'other-item'}));
  await store.recordSealedArtifact(s.grant.id,binding,artifact);
  await store.recordSealedArtifact(s.grant.id,binding,artifact);
  await assert.rejects(()=>store.recordSealedArtifact(s.grant.id,binding,{...artifact,dataId:'replacement'}));
  await assert.rejects(()=>store.recordSealedArtifact(s.grant.id,binding,{...artifact,sha256:'b'.repeat(64)}));
  const auth=await otherStore.authorize(s.token);
  assert.deepEqual(auth.binding.items,[{id:'item-a',dataId:'sealed-data'}]);
  assert.deepEqual((await store.pool.query('SELECT binding FROM grants WHERE id=$1',[s.grant.id])).rows[0].binding,binding);
  const h={Cookie:`__Host-gc-sign=${s.token}`};
  assert.equal((await request(path,{headers:h})).status,404);
  assert.equal((await request(path.replace('data-a','sealed-data'),{headers:h})).status,200);
  await store.revoke(s.grant.id);
  assert.equal((await request(path.replace('data-a','sealed-data'),{headers:h})).status,404);
});
test('redeemed handoff cannot be replayed or used as a session', async () => {
  const s=await session();assert.equal(await store.redeem(s.grant.handoff),null);
  assert.equal(await store.authorize(s.grant.handoff),null);
  assert.equal(await store.authorize(s.token.slice(0,-1)+'!'),null);
});
test('HTTP handoff exchange sets host-only secure cookies and enforces Origin', async () => {
  const grant=await store.issue(binding);const body=JSON.stringify({handoff:grant.handoff});
  assert.equal((await request('/session',{method:'POST',body,headers:{'Content-Type':'application/json',Origin:'https://other.invalid'}})).status,403);
  const r=await request('/session',{method:'POST',body,headers:{'Content-Type':'application/json',Origin:origin}});
  assert.equal(r.status,200);const cookies=r.headers.get('set-cookie');
  assert.match(cookies,/__Host-gc-sign=.*Secure; HttpOnly; SameSite=Strict/);assert.ok(!cookies.includes('Domain='));
  assert.equal((await r.json()).path,'/sign/token-a');
});
test('anonymous copied token PDF is denied before provider access', async () => {
  const count = sent; assert.equal((await request(path)).status,404); assert.equal(sent,count);
});
test('authorized PDF overwrites caching and strips upstream cookies', async () => {
  const s = await session(); const r = await request(path,{ headers: { Cookie: `__Host-gc-sign=${s.token}` } });
  assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'private, no-store');
  assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow'); assert.equal(r.headers.get('set-cookie'),null);
});
test('cross-client session cannot access another recipient token', async () => {
  const s = await session({ ...binding, clientId: 'client-b', recipientToken: 'token-b' });
  const count = sent; assert.equal((await request(path,{ headers: { Cookie: `__Host-gc-sign=${s.token}` } })).status,404); assert.equal(sent,count);
});
test('missing/wrong Origin or CSRF rejects mutation, valid session-bound token passes', async () => {
  const s = await session(); const body = rpc({ token: 'token-a', documentId: 11 });
  const h = { Cookie: `__Host-gc-sign=${s.token}`, 'Content-Type': 'application/json' };
  for (const extra of [{}, { Origin: 'https://attacker.invalid' }, { Origin: origin }, { Origin: origin, 'X-GrowthCast-CSRF': 'wrong' }]) {
    assert.equal((await request('/api/trpc/recipient.completeDocumentWithToken',{method:'POST',body,headers:{...h,...extra}})).status,403);
  }
  assert.equal((await request('/api/trpc/recipient.completeDocumentWithToken',{method:'POST',body,headers:{...h,Origin:origin,'X-GrowthCast-CSRF':s.csrf}})).status,200);
});
test('HEAD and Range are protected after revocation', async () => {
  const s = await session(); await store.revoke(s.grant.id);
  for (const method of ['GET','HEAD']) assert.equal((await request(path,{method,headers:{ Cookie:`__Host-gc-sign=${s.token}`,Range:'bytes=0-4' }})).status,404);
});
test('forged authorization headers and duplicate cookies are rejected', async () => {
  const s = await session();
  assert.equal((await request(path,{headers:{Authorization:'Bearer forged',Cookie:`__Host-gc-sign=${s.token}`}})).status,404);
  assert.equal((await request(path,{headers:{Cookie:`__Host-gc-sign=${s.token}; __Host-gc-sign=${s.token}`}})).status,404);
});
test('identity override, wrong fields, mixed batch and unknown routes fail policy', () => {
  for (const raw of ['/api/v2/envelope/create','/api/auth/signup','//sign/token-a','/sign/x/../token-a','/sign/%74oken-a','/sign/token-a?token=other','/sign/token-b','/embed/sign/token-b','/embed/direct/token-a','/embed/sign/token-a?token=other']) assert.equal(allowRequest(raw,'GET','',binding),false,raw);
  assert.equal(allowRequest('/api/trpc/recipient.completeDocumentWithToken','POST',rpc({ token:'token-a',documentId:11,recipientOverride:{email:'other@example.invalid'} }),binding),false);
  assert.equal(allowRequest('/api/trpc/envelope.field.sign','POST',rpc({token:'token-a',fieldId:22,fieldValue:{type:'SIGNATURE',value:'typed'}}),binding),false);
  assert.equal(allowRequest('/api/trpc/envelope.signingStatus,envelope.signingStatus?batch=1&input='+encodeURIComponent(JSON.stringify({0:{json:{token:'token-a'}},1:{json:{token:'token-b'}}})),'GET','',binding),false);
});
test('only the bound signing embed is allowed, without authoring or query overrides',()=>{
  assert.equal(allowRequest('/embed/sign/token-a','GET','',binding),true);
  assert.equal(allowRequest('/embed/sign/token-a','HEAD','',binding),true);
  assert.equal(allowRequest('/embed/sign/token-a','POST','{}',binding),false);
  assert.equal(allowRequest('/embed/v1/authoring/document/create','GET','',binding),false);
  assert.equal(allowRequest('/embed/sign/token-a.data','GET','',binding),true);
  assert.equal(allowRequest('/embed/sign/token-b.data','GET','',binding),false);
  assert.equal(allowRequest('/embed/sign/token-a.data?token=other','GET','',binding),false);
  assert.equal(allowRequest('/embed/sign/token-a.data?_routes=routes%2Fembed%2B%2F_v0%2B%2Fsign.%24token','GET','',binding),true);
  assert.equal(allowRequest('/embed/sign/token-a.data?_routes=routes%2Fdashboard','GET','',binding),false);
});
test('embed routes deny anonymous, cross-recipient, expired and revoked sessions',async()=>{
  const route='/embed/sign/token-a';
  const s=await session();
  assert.equal((await request(route)).status,404);
  const other=await session({...binding,organizationId:'other-org',recipientToken:'other-token'});
  assert.equal((await request(route,{headers:{Cookie:`__Host-gc-sign=${other.token}`}})).status,404);
  assert.equal((await request(route,{headers:{Cookie:`__Host-gc-sign=${s.token}`,'Sec-Fetch-Site':'cross-site'}})).status,404);
  assert.equal((await request(route,{headers:{Cookie:`__Host-gc-sign=${s.token}`,'Sec-Fetch-Site':'same-site'}})).status,200);
  await store.pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE grant_id=$1",[s.grant.id]);
  assert.equal((await request(route,{headers:{Cookie:`__Host-gc-sign=${s.token}`}})).status,404);
  const revoked=await session();await store.revoke(revoked.grant.id);
  assert.equal((await request(route,{headers:{Cookie:`__Host-gc-sign=${revoked.token}`}})).status,404);
});
test('pinned undefined annotations accepted; arbitrary superjson paths rejected', () => {
  const input={json:{token:'token-a',documentId:11,accessAuthOptions:null,recipientOverride:null},meta:{values:{accessAuthOptions:['undefined'],recipientOverride:['undefined']},v:1}};
  assert.equal(allowRequest('/api/trpc/recipient.completeDocumentWithToken','POST',JSON.stringify(input),binding),true);
  for(const key of ['token','__proto__','recipientOverride.email','documentId']) {
    const malicious={json:{...input.json,[key]:null},meta:{values:{[key]:['undefined']},v:1}};
    assert.equal(allowRequest('/api/trpc/recipient.completeDocumentWithToken','POST',JSON.stringify(malicious),binding),false);
  }
});
test('batch payload shape and duplicate input parameters cannot smuggle calls', () => {
  const valid=encodeURIComponent(JSON.stringify({0:{json:{token:'token-a'}}}));
  const route='/api/trpc/envelope.signingStatus?batch=1&input='+valid;
  assert.equal(allowRequest(route,'GET','',binding),true);
  assert.equal(allowRequest(route+'&input='+valid,'GET','',binding),false);
  assert.equal(allowRequest(route+'&extra=1','GET','',binding),false);
  assert.equal(allowRequest('/api/trpc/envelope.signingStatus?batch=1&input='+encodeURIComponent(JSON.stringify({0:{json:{token:'token-a'}},1:{json:{token:'token-b'}}})),'GET','',binding),false);
});
test('manifest cannot discover another recipient route or arbitrary route namespace', () => {
  for(const path of ['/sign/token-b','/api/auth','/dashboard','//other.invalid','/sign/token-a/../token-b'])
    assert.equal(allowRequest('/__manifest?paths='+encodeURIComponent(path)+'&version=abcdef12','GET','',binding),false);
});
test('store outage fails closed and reveals no error detail', async () => {
  const broken = http.createServer(createHandler({store:{authorize:async()=>{throw Error('private DB detail');}},origin,upstream:'http://127.0.0.1:1',assets:new Set()}));
  await new Promise(resolve=>broken.listen(0,resolve));
  try { const r=await rawFetch(`http://127.0.0.1:${broken.address().port}${path}`,{headers:{Host:new URL(origin).host}});assert.equal(r.status,503);assert.equal(await r.text(),'Signing session unavailable.'); } finally {broken.close();}
});

test('native Original and Signed downloads require the exact bound recipient and item',async()=>{
 const s=await session();
 for(const version of ['original','signed']){
  const route=`/api/files/token/token-a/envelopeItem/item-a/download/${version}`;
  assert.equal(allowRequest(route,'GET','',binding),true);
  assert.equal((await request(route)).status,404);
  assert.equal((await request(route,{headers:{Cookie:`__Host-gc-sign=${s.token}`}})).status,200);
  assert.equal(lastPath,`/api/files/token/token-a/envelope/envelope-a/envelopeItem/item-a/dataId/data-a/${version==='original'?'initial':'current'}/item.pdf`);
  for(const wrong of [route.replace('token-a','token-b'),route.replace('item-a','item-b'),route+'?presignToken=forged',route.replace(version,'pending')])assert.equal(allowRequest(wrong,'GET','',binding),false);
  assert.equal(allowRequest(route,'POST','{}',binding),false);
 }
 await store.revoke(s.grant.id);
 assert.equal((await request('/api/files/token/token-a/envelopeItem/item-a/download/signed',{headers:{Cookie:`__Host-gc-sign=${s.token}`}})).status,404);
});

test('the intermediate signing page permits only same-origin favicon images',async()=>{
 const result=await request('/enter');assert.equal(result.status,200);assert.ok(result.headers.get('content-security-policy').includes("img-src 'self'"));assert.ok((await result.text()).includes('/growthcast-favicon-v2.jpg'));
});


test('document links outlive one-hour sessions, reopen with their approved PIN policy, and expire or revoke',async()=>{
  const documentPins=createPinAccess(documentStore);
  await assert.rejects(()=>store.issue(binding,3601),/Invalid grant TTL/);
  for(const ttl of [604801,0,-1,1.5,NaN])await assert.rejects(()=>documentStore.issue(binding,ttl),/Invalid grant TTL/);
  for(const pinRequired of [true,false]){
    const grant=await documentStore.issue({...binding,pinRequired},604800);
    const access=await documentPins.provision(grant.id);
    const unlock=()=>documentPins.unlock(access.share,pinRequired?access.pin:'',randomUUID());
    const first=await documentStore.redeem(await unlock());assert.ok(first);
    const timing=(await store.pool.query('SELECT g.expires_at AS grant_expiry,s.expires_at AS session_expiry FROM grants g JOIN sessions s ON s.grant_id=g.id WHERE g.id=$1',[grant.id])).rows[0];
    assert.ok(timing.grant_expiry-Date.now()>6*86400000);
    assert.ok(timing.session_expiry-Date.now()<=3600000);
    // Simulate returning after the first browser session expired, without waiting.
    await store.pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE grant_id=$1",[grant.id]);
    assert.equal(await documentStore.authorize(first.token),null);
    const next=await documentStore.redeem(await unlock());assert.ok(await documentStore.authorize(next.token));
    await store.pool.query("UPDATE grants SET expires_at=now()-interval '1 second' WHERE id=$1",[grant.id]);
    assert.equal(await unlock(),null);assert.equal(await documentStore.authorize(next.token),null);
    const revoked=await documentStore.issue({...binding,pinRequired},604800);
    const revokedAccess=await documentPins.provision(revoked.id);
    const revokedSession=await documentStore.redeem(await documentPins.unlock(revokedAccess.share,pinRequired?revokedAccess.pin:'',randomUUID()));
    await documentStore.revoke(revoked.id);
    assert.equal(await documentStore.authorize(revokedSession.token),null);
    assert.equal(await documentPins.unlock(revokedAccess.share,pinRequired?revokedAccess.pin:'',randomUUID()),null);
  }
});
