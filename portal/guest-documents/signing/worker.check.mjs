import test from 'node:test';
import assert from 'node:assert/strict';
import {startDeliveryWorker} from './worker.mjs';
test('stop drains the running delivery and prevents overlapping or future cycles',async()=>{
 let release,calls=0;const pending=new Promise(r=>release=r);
 const worker=startDeliveryWorker({intervalMs:10,delivery:{async runOnce(){calls++;await pending;}}});
 await new Promise(r=>setTimeout(r,35));assert.equal(calls,1);
 let drained=false;const stopping=worker.stop().then(()=>drained=true);
 await Promise.resolve();assert.equal(drained,false);release();await stopping;
 await new Promise(r=>setTimeout(r,25));assert.equal(calls,1);assert.equal(drained,true);
});
test('worker suppresses private failures and survives a failed cycle',async()=>{
 let calls=0,second,release;const again=new Promise(r=>second=r),pending=new Promise(r=>release=r),messages=[];
 const worker=startDeliveryWorker({intervalMs:10,onFailure:m=>messages.push(m),delivery:{async runOnce(){calls++;if(calls===1)throw Error('private-token');second();await pending;}}});
 await again;assert.equal(calls,2);assert.deepEqual(messages,['Document delivery worker cycle failed']);release();await worker.stop();
});
