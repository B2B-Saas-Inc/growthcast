import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApiProxy} from '../vercel-api-proxy.mjs';
const web='https://clients.growthcast.app';
function setup(){const calls=[];const proxy=createApiProxy({webOrigin:web,apiOrigin:'https://api.clients.growthcast.app',originSecret:'a'.repeat(64),fetchImpl:async(url,init)=>{calls.push({url,...init});return new Response('{}',{status:200})}});return {calls,proxy};}
test('signed webhook forwards exact bytes and signature through private ingress without browser credentials',async()=>{
 const {proxy,calls}=setup(),body='{ "id": "synthetic", "type": "ping" }\n';
 assert.equal((await proxy(new Request(web+'/api/payments/webhook/org-123',{method:'POST',headers:{'stripe-signature':'t=123,v1=synthetic','content-type':'application/json','cookie':'session=forged','x-csrf-token':'forged','x-growthcast-origin':'forged'},body}))).status,200);
 assert.equal(calls.length,1);assert.equal(calls[0].body.toString(),body);assert.equal(calls[0].headers.get('stripe-signature'),'t=123,v1=synthetic');assert.equal(calls[0].headers.get('origin'),web);assert.equal(calls[0].headers.get('x-growthcast-origin'),'a'.repeat(64));assert.equal(calls[0].headers.has('cookie'),false);assert.equal(calls[0].headers.has('x-csrf-token'),false);
});
test('missing signatures and adjacent mutation paths keep origin enforcement',async()=>{
 const {proxy,calls}=setup();for(const path of ['/api/payments/webhook/org/a','/api/payments/webhook/','/api/payments/direct/save-key','/api/projects'])assert.equal((await proxy(new Request(web+path,{method:'POST',headers:{'stripe-signature':'synthetic'},body:'{}'}))).status,403);
 assert.equal((await proxy(new Request(web+'/api/payments/webhook/org',{method:'POST',body:'{}'}))).status,403);assert.equal(calls.length,0);
});
test('ordinary browser mutations retain origin and cookies, and drop client signature headers',async()=>{
 const {proxy,calls}=setup();assert.equal((await proxy(new Request(web+'/api/projects',{method:'POST',headers:{origin:web,cookie:'session=test','stripe-signature':'forged'},body:'{}'}))).status,200);assert.equal(calls[0].headers.get('cookie'),'session=test');assert.equal(calls[0].headers.has('stripe-signature'),false);
});
