import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Binding } from '../../gateway/src/policy.mjs';

// Trusted lifecycle entrypoint. Provider API readback and independently verified
// PDF bytes are required; browser callbacks and webhook payloads are not evidence.
export async function reconcileCompletion({ store, grantId, approved, teamId, api, verifiedSha256, leaseToken }) {
  approved = Binding.parse(approved);
  assert.match(verifiedSha256, /^[a-f0-9]{64}$/);
  const envelope = await (await api('/envelope/' + approved.envelopeId)).json();
  assert.equal(envelope.id, approved.envelopeId);
  assert.equal(envelope.teamId, teamId);
  assert.equal(envelope.secondaryId, 'document_' + approved.documentId);
  assert.equal(envelope.status, 'COMPLETED');
  assert.ok(envelope.recipients.length > 0 && envelope.recipients.every(r => r.signingStatus === 'SIGNED'));
  const recipient = envelope.recipients.find(r => r.id === approved.recipientId);
  assert.ok(recipient);
  for (const [actual, expected] of [[recipient.token, approved.recipientToken], [recipient.email, approved.recipientEmail], [recipient.name, approved.recipientName]]) assert.ok(actual === expected, 'Approved recipient identity required');
  assert.deepEqual(envelope.fields.filter(f => f.recipientId === recipient.id).map(f => f.id).sort((a,b)=>a-b), [...approved.fieldIds].sort((a,b)=>a-b));
  // This first integration intentionally supports exactly one immutable source PDF.
  assert.equal(approved.items.length, 1);
  assert.equal(envelope.envelopeItems.length, 1);
  const item = envelope.envelopeItems[0];
  assert.equal(item.id, approved.items[0].id);
  const dataId = item.documentDataId;
  assert.match(dataId, /^[A-Za-z0-9_-]{1,160}$/);
  const response = await api('/envelope/item/' + item.id + '/download');
  const chunks = []; let size = 0;
  for await (const part of response.body) {
    size += part.length;
    assert.ok(size <= 16777216, 'Bounded sealed PDF');
    chunks.push(part);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.subarray(0,5).toString(), '%PDF-');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, verifiedSha256, 'Canonical bytes must match independent cryptographic verification');
  await store.pool.query('SELECT public.lifecycle_complete($1,$2,$3,$4,$5,$6)',
    [grantId,leaseToken,approved,item.id,dataId,sha256]);
  return {itemId:item.id,dataId,sha256};
}
