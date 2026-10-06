/* eslint-disable @typescript-eslint/no-require-imports -- Runs against bundled upstream Prisma and OpenSSL. */
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const assert=require('node:assert/strict');
const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const url=new URL(process.env.NEXT_PRIVATE_DATABASE_URL);
require('./disposable-provider.cjs')(url);
const prisma=new PrismaClient();
(async()=>{
  assert.equal(await prisma.user.count({where:{email:{in:['client@growthcast.invalid','countersigner@growthcast.invalid']}}}),0);
  const verified={},receipts={};
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  for(const name of ['sequential','parallel','rejection','sdk']) {
    const bytes=fs.readFileSync(`/runtime/${name}-sealed.pdf`);
    const text=bytes.toString('latin1');
    const ranges=[...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
    assert.ok(ranges.length,'Cryptographic signature missing');
    const last=ranges.at(-1).slice(1).map(Number);
    assert.equal(last[0],0);assert.equal(last[2]+last[3],bytes.length,'Final signature must cover final revision');
    const gap=bytes.subarray(last[1],last[2]).toString('ascii');
    assert.match(gap,/^<[0-9a-fA-F\s]+>$/);
    fs.writeFileSync('/runtime/signature.der',Buffer.from(gap.slice(1,-1).replace(/\s/g,''),'hex'));
    fs.writeFileSync('/runtime/signed-bytes.bin',Buffer.concat([bytes.subarray(0,last[1]),bytes.subarray(last[2],last[2]+last[3])]));
    execFileSync('openssl',['cms','-verify','-binary','-inform','DER','-in','/runtime/signature.der','-content','/runtime/signed-bytes.bin','-CAfile',process.env.GROWTHCAST_SIGNING_TEST_CA||'/runtime/tls.crt','-purpose','any','-out','/dev/null'],{stdio:'pipe'});
    verified[name]=createHash('sha256').update(bytes).digest('hex');
    const issuedAt=Date.now();
    const canonical=JSON.parse(fs.readFileSync(`/runtime/${name}-canonical.json`,'utf8'));
    const payload=Buffer.from(JSON.stringify({schemaVersion:1,audience:'growthcast-local-lifecycle',environment:'local-test',...canonical,sha256:verified[name],issuedAt,expiresAt:issuedAt+3600000}));
    receipts[name]={payload:payload.toString('base64url'),signature:sign(null,payload,privateKey).toString('base64url')};
    console.log(name+': final PDF signature verified against the local test certificate.');
  }
  fs.writeFileSync('/runtime/verified-artifacts.json',JSON.stringify(verified));
  fs.writeFileSync('/runtime/verification-receipts.json',JSON.stringify(receipts));
  fs.writeFileSync('/runtime/verifier-public.pem',publicKey.export({type:'spki',format:'pem'}));
  // The receipt-signing private key never leaves this verifier process.
  console.log('No signer account was created.');
})().finally(()=>prisma.$disconnect());
