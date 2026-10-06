import test from 'node:test';
import assert from 'node:assert/strict';
import {StorageClient} from './client.mjs';
const credentials = {publishableKey:'sb_publishable_synthetic',subject:'11111111-1111-4111-8111-111111111111',email:'service@growthcast.invalid',password:'x'.repeat(64)};
const config = {projectRef:'abcdefghijklmnopqrst',bucket:'gc-atrium-private',credentials};
test('sealed PDFs can use an explicit bounded limit without raising normal upload limits',async()=>{
 const bytes=Buffer.alloc(4*1024*1024),fetchImpl=async(url,options)=>url.includes('/auth/')?Response.json({user:{id:credentials.subject},access_token:'scoped-token',expires_in:3600}):options.method==='POST'?new Response(null,{status:201}):new Response(bytes,{headers:{'content-type':'application/pdf'}});
 const normal=new StorageClient({...config,fetchImpl}),sealed=new StorageClient({...config,fetchImpl,maxBytes:16*1024*1024});
 await assert.rejects(()=>normal.upload('signed.pdf',bytes,'application/pdf'));
 await assert.rejects(()=>normal.download('signed.pdf'));
 await sealed.upload('signed.pdf',bytes,'application/pdf');assert.equal((await sealed.download('signed.pdf')).bytes.length,bytes.length);
 const projectDownloads=new StorageClient({...config,fetchImpl,maxDownloadBytes:16*1024*1024});
 assert.equal((await projectDownloads.download('signed.pdf')).bytes.length,bytes.length);
 await assert.rejects(()=>projectDownloads.upload('ordinary.pdf',bytes,'application/pdf'));
 assert.throws(()=>new StorageClient({...config,maxDownloadBytes:16*1024*1024+1}));
 for(const maxBytes of [0,NaN,1.5,16*1024*1024+1])assert.throws(()=>new StorageClient({...config,maxBytes}));
 await assert.rejects(()=>sealed.upload('signed.pdf',Buffer.alloc(16*1024*1024+1),'application/pdf'));
});
test('REST transport uses scoped user token, single-flight login and no legacy keys', async () => {
  let logins=0;
  const client = new StorageClient({...config,fetchImpl:async (url,options) => {
    assert.equal(options.redirect,'error'); assert(url.startsWith('https://abcdefghijklmnopqrst.supabase.co/'));
    if (url.includes('/auth/')) {logins++;return Response.json({user:{id:credentials.subject},access_token:'scoped-token',expires_in:3600});}
    assert.equal(options.headers.Authorization,'Bearer scoped-token');
    assert.equal(options.headers.apikey,credentials.publishableKey);
    assert.equal(options.headers['x-upsert'],'false'); return Response.json({});
  }});
  await Promise.all([client.upload('org/project/a',Buffer.from('a'),'text/plain'),client.upload('org/project/b',Buffer.from('b'),'text/plain')]);
  assert.equal(logins,1);
});
test('bad keys, privileged keys, oversize uploads and wrong auth identity fail closed', async () => {
  assert.throws(()=>new StorageClient({...config,credentials:{...credentials,publishableKey:'sb_secret_forbidden'}}));
  const client = new StorageClient({...config,fetchImpl:async()=>{assert.fail('Invalid input must not reach network');}});
  for (const key of ['../a','/a','a//b','a/./b','a\\b','a\0b']) await assert.rejects(()=>client.upload(key,Buffer.from('a'),'text/plain'));
  await assert.rejects(()=>client.upload('a',Buffer.alloc(3*1024*1024+1),'text/plain'));
  const other = new StorageClient({...config,fetchImpl:async()=>Response.json({user:{id:'wrong'},access_token:'token',expires_in:3600})});
  await assert.rejects(()=>other.download('a'),/identity mismatch/);
});
test('download is byte-exact and bounded; deletion targets only one key', async () => {
  let oversized=false;
  const client = new StorageClient({...config,fetchImpl:async (url,options) => {
    if (url.includes('/auth/')) return Response.json({user:{id:credentials.subject},access_token:'token',expires_in:3600});
    if (options.method==='DELETE') {assert.deepEqual(JSON.parse(options.body),{prefixes:['org/file']});return Response.json([]);}
    return new Response(oversized ? Buffer.alloc(3*1024*1024+1) : 'synthetic',{headers:{'content-type':'text/plain'}});
  }});
  assert.equal((await client.download('org/file')).bytes.toString(),'synthetic');
  await client.delete('org/file'); oversized=true;
  await assert.rejects(()=>client.download('org/file'),/download failed/);
});
test('expired tokens reacquire with the service password; upstream errors do not leak response bodies', async () => {
  let now=0,logins=0;
  const client = new StorageClient({...config,now:()=>now,fetchImpl:async url => {
    if (url.includes('/auth/')) {logins++;return Response.json({user:{id:credentials.subject},access_token:'token',expires_in:120});}
    return new Response('secret upstream diagnostic',{status:403});
  }});
  await assert.rejects(()=>client.download('file'),{message:'Storage download failed'});
  now=70000;await assert.rejects(()=>client.download('file'),{message:'Storage download failed'});
  assert.equal(logins,2);
});
