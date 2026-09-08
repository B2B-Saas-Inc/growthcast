import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import Stripe from 'stripe';
import {createHttpHandler} from './http.mjs';
const secret='whsec_test';
function response(){return {headersSent:false,setHeader(){},writeHead(status){this.status=status;this.headersSent=true;return this;},end(){return this;}};}
function request(raw,signature){const req=Readable.from([raw]);req.method='POST';req.headers={'stripe-signature':signature};return req;}
test('HTTP adapter preserves raw bytes and does not initialize runtime for bad signatures',async()=>{
 let writes=0;
 const handler=createHttpHandler({env:{PAYMENTS_TEST_ENABLED:'true',STRIPE_TEST_SIGNING_SECRET:secret},getRuntime:async()=>{writes++;return {ledger:{accept:async()=>{}}};}});
 const raw=Buffer.from(JSON.stringify({id:'evt_test',type:'invoice.updated',livemode:false,data:{object:{id:'in_test',object:'invoice',livemode:false}}}));
 const signature=new Stripe('sk_test_fixture').webhooks.generateTestHeaderString({payload:raw.toString(),secret});
 let res=response();await handler(request(raw,signature),res);assert.equal(res.status,200);assert.equal(writes,1);
 res=response();await handler(request(Buffer.concat([raw,Buffer.from(' ')]),signature),res);assert.equal(res.status,400);assert.equal(writes,1);
 res=response();await handler(request(Buffer.alloc(262145),signature),res);assert.equal(res.status,413);
});
test('HTTP adapter is disabled by default and rejects non-POST',async()=>{
 const handler=createHttpHandler({env:{},getRuntime:async()=>{throw new Error('must not initialize');}});
 let res=response();await handler(request(Buffer.from('{}'),''),res);assert.equal(res.status,503);
 const req=request(Buffer.from('{}'),'');req.method='GET';res=response();await handler(req,res);assert.equal(res.status,405);
});
