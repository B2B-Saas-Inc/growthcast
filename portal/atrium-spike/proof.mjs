import assert from 'node:assert/strict';
import {verify} from 'node:crypto';

// publicKey comes from trusted read-only configuration, never from the receipt.
export function verifyReceipt(receipt,publicKey,{binding,teamId},now=Date.now()) {
  assert.ok(receipt&&typeof receipt.payload==='string'&&receipt.payload.length<=8192);
  assert.match(receipt.signature,/^[A-Za-z0-9_-]{86}$/);
  const bytes=Buffer.from(receipt.payload,'base64url');
  assert.ok(verify(null,bytes,publicKey,Buffer.from(receipt.signature,'base64url')),'Untrusted verification receipt');
  const proof=JSON.parse(bytes);
  assert.equal(proof.schemaVersion,1);
  assert.equal(proof.audience,'growthcast-local-lifecycle');
  assert.equal(proof.environment,'local-test');
  assert.equal(proof.status,'COMPLETED');
  assert.equal(proof.teamId,teamId);
  assert.equal(proof.envelopeId,binding.envelopeId);
  assert.equal(proof.documentId,binding.documentId);
  assert.equal(binding.items.length,1);
  assert.equal(proof.itemId,binding.items[0].id);
  assert.match(proof.dataId,/^[A-Za-z0-9_-]{1,160}$/);
  assert.match(proof.sha256,/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(proof.issuedAt)&&Number.isSafeInteger(proof.expiresAt));
  assert.ok(proof.issuedAt<=now&&proof.expiresAt>now&&proof.expiresAt-proof.issuedAt<=3600000,'Expired verification receipt');
  return proof;
}
