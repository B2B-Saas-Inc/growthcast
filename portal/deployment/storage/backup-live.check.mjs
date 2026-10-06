import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {StorageClient} from './client.mjs';
const writerConfig=JSON.parse(readFileSync('/run/storage/credentials.json','utf8'));
const readerConfig=JSON.parse(readFileSync('/run/reader/credentials.json','utf8'));
const probe=JSON.parse(readFileSync('/run/probe/credentials.json','utf8'));
const make=(credentials,bucket=writerConfig.bucket)=>new StorageClient({projectRef:writerConfig.projectRef,bucket,credentials});
const writer=make(writerConfig),reader=make(readerConfig),other=make(readerConfig,probe.bucket),peer=make(probe.credentials);
assert.notEqual(writerConfig.subject,readerConfig.subject);
const key='verification/'+randomUUID()+'.txt', bytes=Buffer.from('Read-only backup identity acceptance.\n');
let step='writer upload';
try {
  await writer.upload(key,bytes,'text/plain');
  step='reader download';
  assert.deepEqual((await reader.download(key)).bytes,bytes);
  step='reader insert';
  await assert.rejects(reader.upload(key+'-new',bytes,'text/plain'));
  await assert.rejects(writer.download(key+'-new'));
  step='reader overwrite';
  const overwrite=await reader.call('/storage/v1/object/'+reader.objectPath(key),{method:'PUT',headers:{...await reader.headers(),'content-type':'text/plain'},body:Buffer.from('overwrite')});
  assert.equal(overwrite.ok,false);await overwrite.body?.cancel();
  // Storage DELETE may return success for zero affected rows. Verify bytes survive.
  step='reader delete';
  await reader.delete(key).catch(()=>{});
  assert.deepEqual((await writer.download(key)).bytes,bytes);
  step='other bucket read';
  await assert.rejects(other.download('probe.txt'));
  step='other bucket upload';
  await assert.rejects(other.upload('escape.txt',bytes,'text/plain'));
  step='peer read';
  await assert.rejects(peer.download(key));
  step='writer duplicate';
  await assert.rejects(writer.upload(key,bytes,'text/plain'));
  step='writer delete';
  await writer.delete(key);await assert.rejects(reader.download(key));
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),backupSubject:readerConfig.subject,
    checks:['exact-byte read','insert denied','overwrite denied','delete preserves bytes','other-bucket read denied','other-bucket upload denied','peer denied','writer duplicate denied','writer delete preserved'],passed:true}));
} catch {console.error('Storage backup acceptance failed at '+step+'; sensitive details suppressed');process.exitCode=1;}
finally {await writer.delete(key);await writer.delete(key+'-new');}
