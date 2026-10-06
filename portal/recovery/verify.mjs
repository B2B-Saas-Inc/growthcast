import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const provider=new pg.Client({host:'recovery-db',user:'postgres',database:'documenso_test'});
const gateway=new pg.Client({host:'recovery-db',user:'postgres',database:'gateway_test'});
await provider.connect();await gateway.connect();
const hash=b=>createHash('sha256').update(b).digest('hex');
try {
 const groups=JSON.parse(readFileSync('/restored/artifacts/fixtures.json','utf8'));
 const hashes=JSON.parse(readFileSync('/restored/artifacts/verified-artifacts.json','utf8'));
 for(const group of groups) {
  const canonical=JSON.parse(readFileSync('/restored/artifacts/'+group.name+'-canonical.json','utf8'));
  const {rows}=await provider.query('SELECT d.type,d.data,e.status,e."teamId",i.id,i."documentDataId" FROM "EnvelopeItem" i JOIN "DocumentData" d ON d.id=i."documentDataId" JOIN "Envelope" e ON e.id=i."envelopeId" WHERE e.id=$1',[group.envelopeId]);
  assert.equal(rows.length,1);const row=rows[0];assert.equal(row.type,'BYTES_64');
  const bytes=Buffer.from(row.data,'base64');assert.equal(hash(bytes),hashes[group.name]);
  assert.equal(hash(bytes),hash(readFileSync('/restored/artifacts/'+group.name+'-sealed.pdf')));
  assert.equal(row.status,canonical.status);assert.equal(row.teamId,canonical.teamId);assert.equal(row.documentDataId,canonical.dataId);
  for(const signer of group.signers) {
   const grant=(await gateway.query('SELECT binding,revoked_at,expires_at FROM grants WHERE id=$1',[signer.grant.id])).rows[0];
   assert.deepEqual(grant.binding,signer.binding);assert.equal(grant.revoked_at,null);assert(new Date(grant.expires_at)>new Date());
   const artifact=(await gateway.query('SELECT data_id,sha256 FROM sealed_artifacts WHERE grant_id=$1 AND item_id=$2',[signer.grant.id,row.id])).rows[0];
   assert.equal(artifact.data_id,row.documentDataId);assert.equal(artifact.sha256,hash(bytes));
  }
  const ranges=[...bytes.toString('latin1').matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];assert(ranges.length);
  const [start,length,second,tail]=ranges.at(-1).slice(1).map(Number);assert.equal(start,0);assert.equal(second+tail,bytes.length);
  const gap=bytes.subarray(length,second).toString('ascii');assert.match(gap,/^<[0-9a-fA-F\s]+>$/);
  writeFileSync('/tmp/signature.der',Buffer.from(gap.slice(1,-1).replace(/\s/g,''),'hex'));
  writeFileSync('/tmp/signed.bin',Buffer.concat([bytes.subarray(0,length),bytes.subarray(second)]));
  execFileSync('openssl',['cms','-verify','-binary','-inform','DER','-in','/tmp/signature.der','-content','/tmp/signed.bin','-CAfile','/restored/artifacts/tls.crt','-purpose','any','-out','/dev/null'],{stdio:'pipe'});
 }
 assert.equal((await provider.query('SELECT count(*)::int AS count FROM "User" WHERE email IN ($1,$2)',['client@growthcast.invalid','countersigner@growthcast.invalid'])).rows[0].count,0);
 assert((await gateway.query('SELECT count(*)::int AS count FROM sessions')).rows[0].count>0);
 console.log('Restored four real signed PDFs verified with OpenSSL; hashes, provider teams/status, recipient grants, canonical references and sessions agree.');
} finally {await provider.end();await gateway.end();}
