import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Synthetic only: no provider, account, storage service, or real recipient.
export const fixture = {
  token: 'synthetic-recipient-token',
  envelopeId: 'synthetic-envelope',
  itemId: 'synthetic-item',
  dataId: 'synthetic-data',
  accessAuth: ['TWO_FACTOR_AUTH'],
  storageReads: 0,
  sessionReads: 0,
};
export const pdf = new TextEncoder().encode('%PDF-1.4\n% GrowthCast synthetic boundary fixture\n%%EOF');
export const prisma = {
  envelopeItem: {
    async findFirst({ where }) {
      // Model the real query predicate, including ownership and token matching.
      if (where.id !== fixture.itemId || where.documentDataId !== fixture.dataId ||
          where.envelope?.id !== fixture.envelopeId ||
          where.envelope?.recipients?.some?.token !== fixture.token) return null;
      return {
        id: fixture.itemId,
        envelopeId: fixture.envelopeId,
        documentDataId: fixture.dataId,
        envelope: { authOptions: { globalAccessAuth: fixture.accessAuth } },
        documentData: { type: 'BYTES', data: 'synthetic-current', initialData: 'synthetic-initial' },
      };
    },
  },
};
export async function getOptionalSession() {
  fixture.sessionReads++;
  return { user: null };
}
export async function verifyEmbeddingPresignToken() { throw new Error('No presign token in spike'); }
export async function checkEnvelopeFileAccess() { return false; }
export function sha256(value) { return createHash('sha256').update(value).digest(); }
export async function getFileServerSide({ type, data }) {
  assert.equal(type, 'BYTES');
  assert.ok(['synthetic-current', 'synthetic-initial'].includes(data));
  fixture.storageReads++;
  return pdf;
}
