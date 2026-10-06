import assert from 'node:assert/strict';
import test from 'node:test';
import {managedGatewayStore,managedLifecyclePool} from './managed-store.mjs';
import {storeWithPool} from '../../gateway/src/store.mjs';
test('managed gateway refuses wrong environment, project, TLS and privileged identities before connecting',async()=>{
 const config={url:'postgresql://gc_gateway:synthetic@db.saedetvoolpdysiyjwvg.supabase.co/postgres',projectRef:'saedetvoolpdysiyjwvg',ca:'test-ca',environment:'staging'};
 for(const patch of [{environment:'production'},{projectRef:'wrong'},{ca:''},{url:config.url.replace('gc_gateway:','gc_app:')},{url:config.url.replace('gc_gateway:','postgres:')},{url:config.url.replace('/postgres','/foundation_test')}])await assert.rejects(()=>managedGatewayStore({...config,...patch}));
});
test('a store never issues a grant bound to another environment',async()=>{
 let calls=0;const pool={query:async()=>{calls++;},connect:async()=>{calls++;throw Error('Unexpected connection');},on:()=>{}};
 const binding={environment:'local-test',organizationId:'org',clientId:'client',documentVersion:'version',envelopeId:'envelope',documentId:1,recipientId:1,recipientToken:'token',recipientName:'Client',recipientEmail:'client@example.test',fieldIds:[1],items:[{id:'item',dataId:'data'}]};
 await assert.rejects(()=>storeWithPool(pool,'staging').issue(binding),/environment mismatch/);
 await assert.rejects(()=>storeWithPool(pool,'local-test').issue({...binding,environment:'staging'}),/environment mismatch/);assert.equal(calls,0);
});
test('lifecycle runtime rejects application and gateway credentials before connecting',async()=>{
 for(const role of ['gc_app','gc_gateway','postgres'])await assert.rejects(()=>managedLifecyclePool({url:'postgresql://'+role+':synthetic@db.saedetvoolpdysiyjwvg.supabase.co/postgres',projectRef:'saedetvoolpdysiyjwvg',ca:'synthetic',environment:'staging'}),/Dedicated signing role/);
});
