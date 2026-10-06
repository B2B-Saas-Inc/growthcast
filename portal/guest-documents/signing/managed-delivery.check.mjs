import test from 'node:test';
import assert from 'node:assert/strict';
import {managedDeliveryFactory} from './managed-delivery.mjs';
const config={organizationId:'workspace',providerToken:'api_'+'a'.repeat(48),teamId:1,encryptionKey:Buffer.alloc(32,1),authSecret:'b'.repeat(64)};
test('delivery configuration requires valid provider and encryption material',()=>{
 for(const changes of [{organizationId:''},{providerToken:'invalid'},{teamId:0},{encryptionKey:Buffer.alloc(0)}])assert.throws(()=>managedDeliveryFactory({...config,...changes}));
});
test('workspace-scoped delivery rejects cross-workspace operations before database effects',async()=>{
 let queries=0;const pool={on(){},async query(){queries++;throw Error();},async connect(){queries++;throw Error();}};
 const delivery=managedDeliveryFactory(config)({pool,flow:{signingSource(){throw Error();},prepareDispatch(){throw Error();}},readArtifact:async()=>Buffer.alloc(0),readCompletedArtifact:async()=>{throw Error();}});
 for(const method of ['request','status','statusForApproval'])await assert.rejects(()=>delivery[method]('actor','other','id'),/Signing workspace unavailable/);
 assert.equal(queries,0);
});
