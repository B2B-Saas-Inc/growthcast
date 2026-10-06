/* eslint-disable @typescript-eslint/no-require-imports -- Runs the compiled Atrium storage adapter in its pinned Bun image. */
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {randomUUID,createHash} = require('node:crypto');
const {SupabaseStorage} = require('/upstream/apps/api/dist/files/storage/supabase.storage.js');
const {StorageClient} = require('/boundary/deployment/storage/client.mjs');
(async () => {
  const credentials = JSON.parse(readFileSync('/run/storage/credentials.json','utf8'));
  const probe = JSON.parse(readFileSync('/run/probe/credentials.json','utf8'));
  assert.equal(credentials.projectRef,'saedetvoolpdysiyjwvg');
  assert.equal(credentials.bucket,'gc-atrium-private');
  assert(probe.bucket.startsWith('gc-isolation-probe-'));
  const storage = new SupabaseStorage({getOrThrow:key=>({PORTAL_STORAGE_PROJECT_REF:credentials.projectRef,PORTAL_STORAGE_BUCKET:credentials.bucket})[key]});
  const own = new StorageClient({...credentials,credentials});
  const peer = new StorageClient({...credentials,credentials:probe.credentials});
  const otherBucket = new StorageClient({...credentials,bucket:probe.bucket,credentials});
  const key = 'verification/'+randomUUID()+'.txt';
  const bytes = Buffer.from('Synthetic managed storage acceptance artifact.\n');
  let uploaded = false;
  try {
    await storage.upload(key,bytes,'text/plain'); uploaded=true;
    const downloaded = await storage.download(key), chunks=[];
    for await(const chunk of downloaded.body) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks),bytes);
    await assert.rejects(()=>storage.upload(key,Buffer.from('overwrite'),'text/plain'));
    await assert.rejects(()=>peer.download(key));
    await assert.rejects(()=>otherBucket.upload('probe.txt',bytes,'text/plain'));
    const origin='https://'+credentials.projectRef+'.supabase.co';
    for(const path of ['/storage/v1/object/public/','/storage/v1/object/authenticated/']) {
      const response=await fetch(origin+path+credentials.bucket+'/'+key,{headers:{apikey:credentials.publishableKey},redirect:'error'});
      assert(!response.ok); await response.body?.cancel();
    }
    const overwritten=await fetch(origin+'/storage/v1/object/'+credentials.bucket+'/'+key,{method:'PUT',headers:{...await own.headers(),'content-type':'text/plain'},body:'overwrite',redirect:'error'});
    assert(!overwritten.ok); await overwritten.body?.cancel();
    assert.deepEqual((await own.download(key)).bytes,bytes);
    await storage.delete(key); uploaded=false;
    await assert.rejects(()=>storage.download(key));
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),projectRef:credentials.projectRef,bucket:credentials.bucket,
      artifactSha256:createHash('sha256').update(bytes).digest('hex'),compiledAdapter:'passed',uploadDownloadDelete:'passed',
      duplicateAndUpdateDenial:'passed',anonymousAndPublicDenial:'passed',otherIdentityDenial:'passed',crossBucketWriteDenial:'passed',cleanup:'passed'},null,2));
  } finally { if(uploaded) await storage.delete(key); }
})().catch(()=>{console.error('Managed storage verification failed; details suppressed');process.exitCode=1;});
