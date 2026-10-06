import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {StorageClient} from '/boundary/deployment/storage/client.mjs';
const c=JSON.parse(readFileSync('/private/connection.json'));assert.equal(c.projectRef,'mdjldxussxdtcjxsoesr');const client=new StorageClient({projectRef:c.projectRef,bucket:'gc-atrium-private',credentials:c.storage});
if(process.argv[2]==='create'){
 const key='production-recovery/'+randomUUID()+'.txt',bytes=Buffer.from('GrowthCast production independent storage recovery acceptance\n');await client.upload(key,bytes,'text/plain');assert.deepEqual((await client.download(key)).bytes,bytes);writeFileSync('/private/recovery-object.json',JSON.stringify({key,sha256:createHash('sha256').update(bytes).digest('hex')}));console.log('Synthetic production recovery object created.');
}else{
 const {key}=JSON.parse(readFileSync('/private/recovery-object.json'));assert.match(key,/^production-recovery\/[a-f0-9-]{36}\.txt$/);await client.delete(key);await assert.rejects(()=>client.download(key));console.log('Synthetic production recovery object removed.');
}
