import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeProxy} from './runtime.mjs';
const proof='a'.repeat(64);
const env={PORTAL_WEB_URL:'https://clients.staging.growthcast.app',PORTAL_API_URL:'https://api.clients.staging.growthcast.app',PORTAL_API_ORIGIN_PROOF:proof};
test('server proxy admits only configured proof and filters credentials and metadata',async()=>{
 let calls=0;
 const proxy=createRuntimeProxy(env,async(url,options)=>{
  calls++;assert.equal(url,env.PORTAL_API_URL+'/api/me');
  assert.equal(options.headers.get('x-growthcast-origin'),proof);
  assert.equal(options.headers.get('authorization'),null);assert.equal(options.headers.get('x-forwarded-for'),null);assert.equal(options.headers.get('x-amz-security-token'),null);
  assert.equal(options.headers.get('cookie'),'session=synthetic');
  return new Response('private response',{headers:{'set-cookie':'session=synthetic; HttpOnly; Secure; SameSite=Lax','x-growthcast-origin':proof}});
 });
 const response=await proxy(new Request(env.PORTAL_WEB_URL+'/api/me',{headers:{cookie:'session=synthetic',authorization:'Bearer client-controlled','x-growthcast-origin':'forged','x-forwarded-for':'client-controlled','x-amz-security-token':'forged'}}));
 assert.equal(calls,1);assert.equal(response.status,200);assert.equal(await response.text(),'private response');assert.equal(response.headers.get('x-growthcast-origin'),null);
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(response.headers.getSetCookie().length,1);
 assert.equal((await proxy(new Request(env.PORTAL_WEB_URL+'/api/me',{method:'POST',headers:{origin:'https://other.invalid'}}))).status,403);assert.equal(calls,1);
});
test('missing/public proof, wrong API origin and upstream errors fail closed',async()=>{
 assert.throws(()=>createRuntimeProxy({...env,PORTAL_API_ORIGIN_PROOF:undefined}));
 assert.throws(()=>createRuntimeProxy({...env,NEXT_PUBLIC_ORIGIN_PROOF:proof}));
 assert.throws(()=>createRuntimeProxy({...env,PORTAL_API_URL:'https://untrusted.invalid'}));
 const proxy=createRuntimeProxy(env,async()=>{throw Error(proof);});
 const response=await proxy(new Request(env.PORTAL_WEB_URL+'/api/me'));assert.equal(response.status,502);assert.match(response.headers.get('content-type'),/application\/json/);
 const body=await response.text();assert(!body.includes(proof));assert.deepEqual(JSON.parse(body),{message:'The portal is temporarily unavailable. Please try again shortly.'});
});
