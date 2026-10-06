import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {randomBytes} from 'node:crypto';
import {access} from './access.mjs';
import {hash} from './workflow.mjs';
import {runInNewContext} from 'node:vm';
import {guestHandler} from './http.mjs';
export async function checkAccess({pool,flow,approval,passed}){
 const x=access(pool),y=access(pool),dispatch=await flow.prepareDispatch('staff','guest-org',approval),id=dispatch.id;
 await assert.rejects(()=>x.issue('client','guest-org',id));await assert.rejects(()=>x.issue('staff','other-org',id));passed('PIN provisioning requires verified organization staff');
 let credentials=await x.issue('staff','guest-org',id);assert.match(credentials.pin,/^\d{8}$/);
 const stored=(await pool.query('SELECT * FROM gc_atrium.guest_access WHERE dispatch_id=$1',[id])).rows[0];assert.notEqual(stored.share_hash,credentials.share);assert.equal(stored.pin_hash.length,32);passed('random PIN and share stored only as salted/hash material');
 const sessions=await Promise.all(Array.from({length:8},(_,i)=>(i%2?x:y).unlock(credentials.share,credentials.pin,'parallel-source')));assert.equal(sessions.filter(Boolean).length,5);passed('atomic per-share attempt budget across two service instances');
 const valid=sessions.find(Boolean);assert(await x.authorize(valid.session));
 const expired=randomBytes(32).toString('base64url');await pool.query("INSERT INTO gc_atrium.guest_session VALUES($1,$2,0,$3,now()-interval '1 second')",[hash(expired),id,hash('expired-csrf')]);assert.equal(await x.authorize(expired),null);passed('expired sessions denied');
 const old=credentials;credentials=await x.issue('staff','guest-org',id);assert.equal(await x.authorize(valid.session),null);assert.equal(await x.unlock(old.share,old.pin,'fresh-source'),null);passed('PIN rotation invalidates existing sessions and old links');
 assert.equal((await pool.query("SELECT actor_id FROM gc_atrium.guest_access_audit WHERE dispatch_id=$1 AND action='pin_rotated'",[id])).rows[0].actor_id,'staff');passed('PIN rotation audit identifies the approving staff account');
 const one=await x.unlock(credentials.share,credentials.pin,'logout-source');assert(one);assert.equal(await x.logout(one.session,'bad-csrf'),false);assert(await x.authorize(one.session));assert(await x.logout(one.session,one.csrf));assert.equal(await y.authorize(one.session),null);passed('logout requires session-bound CSRF and prevents replay');
 credentials=await x.issue('staff','guest-org',id);
 const fake=()=>randomBytes(32).toString('base64url');
 for(let i=0;i<30;i++)assert.equal(await x.unlock(fake(),'00000000','limited-source'),null);
 assert.equal(await y.unlock(credentials.share,credentials.pin,'limited-source'),null);passed('source budget cannot be bypassed with fresh share identifiers');
 const origin='https://guest.growthcast.test';let artifact=Buffer.from('synthetic-approved-bytes'),duringRead;
 const handler=guestHandler({store:x,origin,staffWorkflow:flow,logo:Buffer.from('synthetic-logo'),authenticateStaff:async req=>req.headers['x-synthetic-staff']==='allowed'?{userId:'staff',organizationId:'guest-org',csrfValid:true}:null,readArtifact:async()=>{if(duringRead)await duringRead();return artifact;}});
 assert.throws(()=>guestHandler({store:x,origin}));passed('HTTP endpoint configuration fails closed');
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(path,method='GET',body,headers={})=>new Promise((resolve,reject)=>{
  const req=httpRequest(base+path,{method,headers:{Host:'guest.growthcast.test',...(method==='POST'?{origin,'Content-Type':'application/json'}:{}),...headers}},res=>{
   const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:{get:name=>Array.isArray(res.headers[name])?res.headers[name].join(','):res.headers[name]},text:async()=>bytes.toString(),json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes});});
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 try{
  let staffResult=await request('/api/guest/staff/catalog','GET',undefined,{'x-synthetic-staff':'allowed'});assert.equal(staffResult.status,200);assert((await staffResult.json()).projects.items.every(p=>p.id==='guest-project'));
  assert.equal((await request('/api/guest/staff/clients','POST',{name:'HTTP prospect'},{'x-synthetic-staff':'allowed'})).status,200);
  staffResult=await request('/api/guest/staff/catalog?collection=clients&limit=1','GET',undefined,{'x-synthetic-staff':'allowed'});
  assert.equal(staffResult.status,200);const page=(await staffResult.json()).clients;assert.equal(page.items.length,1);assert(page.nextCursor);
  staffResult=await request('/api/guest/staff/catalog?collection=clients&limit=1&after='+page.nextCursor,'GET',undefined,{'x-synthetic-staff':'allowed'});
  assert.equal(staffResult.status,200);assert.notEqual((await staffResult.json()).clients.items[0].id,page.items[0].id);
  for(const query of ['limit=1&limit=2','collection=clients&collection=projects','collection=clients&after=bad','organizationId=other-org','collection=clients&limit=101','collection=clients&limit=1e2','collection=clients&limit=01','after='+page.nextCursor])assert.equal((await request('/api/guest/staff/catalog?'+query,'GET',undefined,{'x-synthetic-staff':'allowed'})).status,404);
  assert.equal((await request('/api/guest/staff/catalog?collection=clients&limit=1')).status,403);
  passed('HTTP catalog pagination validates query fields and requires authenticated staff on every page');

  assert.equal((await request('/api/guest/staff/clients','POST',{name:'Denied',organizationId:'other-org'},{'x-synthetic-staff':'allowed'})).status,404);
  assert.equal((await request('/api/guest/staff/clients','POST',{name:'Denied'})).status,403);passed('staff catalog and creation use server identity; client-selected scope and anonymous writes denied');
  const guestScript=await (await request('/guest.js')).text();
  for(const fragment of ['#new-document-share','']){let requests=0;runInNewContext(guestScript,{location:{hash:fragment},history:{replaceState:()=>{}},document:{querySelector:()=>({addEventListener:()=>{}})},fetch:async()=>{requests++;return {ok:false};}});assert.equal(requests,fragment?0:1);}passed('a new share link cannot display a document from an earlier cookie session');
  let r=await request('/guest');assert.equal(r.status,200);assert(!(await r.text()).includes('Approved contract'));assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('x-robots-tag'),/noindex/);
  for(const [path,method] of [['/api/guest/document','GET'],['/api/guest/artifact','GET'],['/api/guest/artifact','HEAD'],['/api/guest/artifact?document=other','GET']])assert.equal((await request(path,method)).status,404);passed('locked page has no private title; anonymous GET HEAD and alternate IDs denied');
  assert.equal((await request('/api/guest/staff/pin','POST',{dispatchId:id})).status,403);
  assert.equal((await request('/api/guest/unlock','POST',credentials,{origin:'https://evil.example'})).status,403);passed('staff API and cross-origin unlock denied');
  const planted=fake();r=await request('/api/guest/unlock','POST',credentials,{cookie:'__Host-gc-guest='+planted});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);assert(!/Domain=/i.test(cookie));const sessionCookie=cookie.split(';')[0],csrf=(await r.json()).csrf;assert(!sessionCookie.endsWith(planted));passed('unlock creates a fresh session instead of accepting a planted cookie');
  r=await request('/api/guest/document','GET',undefined,{cookie:sessionCookie});assert.equal(r.status,200);const doc=await r.json();assert.equal(doc.title,'Approved contract');assert.deepEqual(Object.keys(doc).sort(),['title','versionId']);passed('fresh host-only session reveals only its bound document');
  assert.equal((await request('/api/guest/document','GET',undefined,{cookie:sessionCookie+'; '+sessionCookie})).status,404);assert.equal((await request('/api/guest/artifact?document=other','GET',undefined,{cookie:sessionCookie})).status,404);passed('duplicate cookies and alternate document selectors fail closed');
  r=await request('/api/guest/artifact','GET',undefined,{cookie:sessionCookie});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),artifact);
  assert.equal((await request('/api/guest/artifact','HEAD',undefined,{cookie:sessionCookie})).status,200);
  assert.equal((await request('/api/guest/artifact','GET',undefined,{cookie:sessionCookie,range:'bytes=0-4'})).status,416);
  artifact=Buffer.from('tampered');assert.equal((await request('/api/guest/artifact','GET',undefined,{cookie:sessionCookie})).status,404);artifact=Buffer.from('synthetic-approved-bytes');passed('artifact bytes match approved hash; unauthorized range and tampering denied');
  assert.equal((await request('/api/guest/logout','POST',{}, {cookie:sessionCookie,'x-growthcast-csrf':'wrong'})).status,403);
  assert.equal((await request('/api/guest/logout','POST',{}, {cookie:sessionCookie,'x-growthcast-csrf':csrf})).status,200);assert.equal((await request('/api/guest/document','GET',undefined,{cookie:sessionCookie})).status,404);passed('HTTP logout rejects forged CSRF and invalidates cookie replay');
  credentials=await x.issue('staff','guest-org',id);r=await request('/api/guest/unlock','POST',credentials);const freshCookie=r.headers.get('set-cookie').split(';')[0];
  duringRead=()=>flow.revoke('staff','guest-org',id);assert.equal((await request('/api/guest/artifact','GET',undefined,{cookie:freshCookie})).status,404);duringRead=undefined;
  assert.equal((await request('/api/guest/document','GET',undefined,{cookie:freshCookie})).status,404);await assert.rejects(()=>x.issue('staff','guest-org',id));passed('revocation during storage read prevents delivery and subsequent PIN issuance');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
