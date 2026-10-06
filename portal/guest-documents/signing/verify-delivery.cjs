// Synthetic completion signature verification in the pinned provider container.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const bytes=fs.readFileSync('/runtime/delivery-sealed.pdf'),text=bytes.toString('latin1');
const ranges=[...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
assert.ok(ranges.length);const [start,length,offset,remaining]=ranges.at(-1).slice(1).map(Number);assert.equal(start,0);assert.equal(offset+remaining,bytes.length);
const gap=bytes.subarray(length,offset).toString('ascii');assert.match(gap,/^<[0-9a-fA-F\s]+>$/);
fs.writeFileSync('/runtime/delivery-signature.der',Buffer.from(gap.slice(1,-1).replace(/\s/g,''),'hex'));
fs.writeFileSync('/runtime/delivery-signed-bytes.bin',Buffer.concat([bytes.subarray(0,length),bytes.subarray(offset)]));
execFileSync('openssl',['cms','-verify','-binary','-inform','DER','-in','/runtime/delivery-signature.der','-content','/runtime/delivery-signed-bytes.bin','-CAfile','/runtime/tls.crt','-purpose','any','-out','/dev/null'],{stdio:'pipe'});
console.log('Completed document signature verifies against the isolated test certificate.');
