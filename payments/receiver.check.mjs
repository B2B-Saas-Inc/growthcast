import {test} from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createReceiver,invoiceSummary} from './receiver.mjs';
const stripe=new Stripe('sk_test_fixture');const secret='whsec_fixture';
function fixture(overrides={}) {return {id:'evt_test',type:'invoice.updated',livemode:false,data:{object:{id:'in_test',object:'invoice',livemode:false}},...overrides};}
function signed(event, timestamp) {const raw=Buffer.from(JSON.stringify(event));return [raw,stripe.webhooks.generateTestHeaderString({payload:raw.toString(),secret,timestamp})];}
test('valid signature persists before acknowledgement',async()=>{let called=false;const r=createReceiver({secret,enabled:true,ledger:{accept:async()=>{called=true;}}});assert.equal((await r(...signed(fixture()))).status,200);assert.ok(called);});
test('invalid, stale or changed body rejected without writes',async()=>{const r=createReceiver({secret,enabled:true,ledger:{accept:async()=>{throw new Error('must not write');}}});assert.equal((await r(Buffer.from('{}'),'bad')).status,400);assert.equal((await r(...signed(fixture(),Math.floor(Date.now()/1000)-400))).status,400);const [raw,sig]=signed(fixture());assert.equal((await r(Buffer.concat([raw,Buffer.from(' ')]),sig)).status,400);});
test('live mode and foreign connected account rejected',async()=>{const r=createReceiver({secret,enabled:true,ledger:{}});for(const event of [fixture({livemode:true}),fixture({account:'acct_other'})])assert.equal((await r(...signed(event))).status,403);});
test('database failure is retryable, not success',async()=>{const r=createReceiver({secret,enabled:true,ledger:{accept:async()=>{throw new Error('offline');}}});assert.equal((await r(...signed(fixture()))).status,503);});
test('disabled and bounded receiver',async()=>{assert.equal((await createReceiver({secret,enabled:false})(Buffer.alloc(0),'')).status,503);assert.equal((await createReceiver({secret,enabled:true})(Buffer.alloc(262145),'')).status,413);});
test('unsupported events ignored without writes',async()=>{assert.equal((await createReceiver({secret,enabled:true,ledger:{}})(...signed(fixture({type:'customer.created'})))).status,200);});
test('malformed invoice rejected',async()=>{assert.equal((await createReceiver({secret,enabled:true,ledger:{}})(...signed(fixture({data:{object:{}}})))).status,400);});
test('summary requires current scoped test USD integer amounts',()=>{const b={invoice_id:'in_test',customer_id:'cus_test'};const i={id:'in_test',customer:'cus_test',livemode:false,currency:'usd',status:'paid',amount_due:100,amount_paid:100,amount_remaining:0};assert.equal(invoiceSummary(i,b).amount_paid,100);for(const change of [{livemode:true},{currency:'eur'},{amount_due:1.5},{customer:'cus_other'},{status:'unknown'}])assert.throws(()=>invoiceSummary({...i,...change},b));});
