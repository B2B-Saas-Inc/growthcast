import test from 'node:test';
import assert from 'node:assert/strict';
import {managedProviderApi} from './provider-api.mjs';
const origin='http://documenso.signing.staging.growthcast.internal:3000',token='api_'+'a'.repeat(48);
test('private provider transport fixes authority, credentials and redirects',async()=>{
 let seen;const api=managedProviderApi({origin,token,fetchImpl:async(url,options)=>{seen={url,options};return new Response('{}');}});
 await api('/envelope/create',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});
 assert.equal(seen.url,origin+'/api/v2/envelope/create');assert.equal(seen.options.headers.get('authorization'),'Bearer '+token);
 assert.equal(seen.options.redirect,'error');assert.ok(seen.options.signal instanceof AbortSignal);
});
test('caller cannot redirect credentials or override transport controls',async()=>{
 let calls=0;const api=managedProviderApi({origin,token,fetchImpl:async()=>{calls++;return new Response('{}');}});
 for(const path of ['https://evil.invalid/envelope','//evil.invalid','/envelope/../user','/envelope/%2e%2e','/envelope/a?url=evil','/envelope/a#b'])await assert.rejects(()=>api(path));
 for(const options of [{headers:{Authorization:'other'}},{headers:{Host:'evil.invalid'}},{redirect:'follow'},{signal:new AbortController().signal},{method:'DELETE'}])await assert.rejects(()=>api('/envelope/a',options));
 assert.equal(calls,0);assert.throws(()=>managedProviderApi({origin:'https://example.com',token}));
});
test('provider errors expose neither response bodies nor credentials',async()=>{
 for(const fetchImpl of [async()=>new Response(token,{status:401}),async()=>{throw Error(token);}]){
  const api=managedProviderApi({origin,token,fetchImpl});
  await assert.rejects(()=>api('/envelope/a'),e=>e.message==='Private signing provider request unavailable'&&!e.cause);
 }
});
