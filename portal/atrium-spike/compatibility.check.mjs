import { test, expect, beforeAll, afterAll } from 'bun:test';
import { PrismaService } from './src/prisma/prisma.service';
import { AuthService } from './src/auth/auth.service';
import { DocumentsService } from './src/documents/documents.service';
import { PaymentsService } from './src/payments/payments.service';

const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== 'database' || url.pathname !== '/atrium_test') throw new Error('Disposable database required');
const db = new PrismaService();
const config = {
  get: (key, fallback) => ({ ALLOW_SIGNUPS: 'false', WEB_URL: 'http://localhost:3000', API_URL: 'http://localhost:3001' })[key] ?? fallback,
  getOrThrow: () => 'synthetic-local-secret-with-at-least-32-characters',
};
const noop = async () => {};
const docs = new DocumentsService(db, {}, {}, {}, {}, {});
let doc, invoice, link;
const checkouts = [];
let notifications = 0;
const stripe = { checkout: { sessions: {
  create: async (params, options) => {
    checkouts.push({ params, options });
    return { id: 'cs_fixture', url: 'https://checkout.invalid/fixture' };
  },
  retrieve: async () => ({ status: 'open', url: 'https://checkout.invalid/fixture' }),
} } };
const payments = new PaymentsService(db, { stripe }, {}, config, { notifyInvoicePaid: async () => { notifications++; } });
beforeAll(async () => {
  await db.$connect();
  await db.organization.create({ data: { id: 'org', name: 'Synthetic', slug: 'synthetic' } });
  await db.organization.create({ data: { id: 'other-org', name: 'Other synthetic', slug: 'other-synthetic' } });
  await db.systemSettings.create({ data: { organizationId: 'other-org', stripeConnectEnabled: true, stripeConnectAccountId: 'acct_other' } });
  await db.user.create({ data: { id: 'owner', name: 'Owner', email: 'owner@example.test', emailVerified: true } });
  await db.user.create({ data: { id: 'client', name: 'Client', email: 'client@example.test', emailVerified: true } });
  await db.project.create({ data: { id: 'project', name: 'Synthetic', organizationId: 'org' } });
  await db.projectClient.create({ data: { projectId: 'project', userId: 'client' } });
  const file = await db.file.create({ data: { filename: 'synthetic.pdf', projectId: 'project', organizationId: 'org', uploadedById: 'owner' } });
  doc = await db.document.create({ data: { title: 'Synthetic', type: 'contract', status: 'pending', fileId: file.id, projectId: 'project', organizationId: 'org', uploadedById: 'owner' } });
  await db.systemSettings.create({ data: { organizationId: 'org', stripeConnectEnabled: true, stripeConnectAccountId: 'acct_fixture' } });
  invoice = await db.invoice.create({ data: { invoiceNumber: 'SYN-1', organizationId: 'org', projectId: 'project', status: 'sent', lineItems: { create: { description: 'Synthetic', quantity: 2, unitPrice: 1500 } } } });
});
afterAll(async () => { await db.$disconnect(); });

async function signup(email) {
  const auth = new AuthService(config, db, { send: noop }, { initializeFreePlan: noop });
  const response = await auth.auth.handler(new Request('http://localhost:3001/api/auth/sign-up/email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001' },
    body: JSON.stringify({ name: 'Synthetic', email, password: 'synthetic-password-1234' }),
  }));
  return { status: response.status, body: await response.json() };
}
test('closed signup denies uninvited user', async () => {
  expect((await signup('stranger@example.test')).status).toBe(403);
  expect(await db.user.count({ where: { email: 'stranger@example.test' } })).toBe(0);
});
test('invitation permits signup but does not establish verified identity', async () => {
  await db.invitation.create({ data: { id: 'invite', organizationId: 'org', inviterId: 'owner', email: 'invited@example.test', role: 'member', status: 'pending', expiresAt: new Date(Date.now() + 60000) } });
  const result = await signup('invited@example.test');
  expect(result.status).toBe(200);
  expect(result.body.user.emailVerified).toBe(false);
  expect(typeof result.body.token).toBe('string');
  expect(await db.session.count({ where: { userId: result.body.user.id } })).toBe(1);
});
test('document link generation rejects accountless and wrong organization requests', async () => {
  await expect(docs.generateAccessToken(doc.id, 'missing-user', 'org')).rejects.toThrow('not a client');
  await expect(docs.generateAccessToken(doc.id, 'client', 'other-org')).rejects.toThrow('not found');
});
test('native link is hashed at rest but reusable without PIN', async () => {
  link = await docs.generateAccessToken(doc.id, 'client', 'org');
  const stored = await db.documentAccessToken.findFirst({ where: { documentId: doc.id } });
  expect(stored.token).not.toBe(link.token);
  expect((await docs.validateAccessToken(link.token)).userId).toBe('client');
  expect((await docs.validateAccessToken(link.token)).documentId).toBe(doc.id);
});
test('native token remains valid after project assignment removal', async () => {
  await db.projectClient.deleteMany({ where: { projectId: 'project', userId: 'client' } });
  expect((await docs.validateAccessToken(link.token)).userId).toBe('client');
  await expect(docs.getViewStream(doc.id, 'client', 'org', 'member')).rejects.toThrow();
  await expect(docs.getSigningInfo(doc.id, 'client', 'org', 'member')).rejects.toThrow();
  await db.projectClient.create({ data: { projectId: 'project', userId: 'client' } });
});
test('draft documents deny native token validation', async () => {
  await db.document.update({ where: { id: doc.id }, data: { status: 'draft' } });
  await expect(docs.validateAccessToken(link.token)).rejects.toThrow('no longer available');
  await db.document.update({ where: { id: doc.id }, data: { status: 'pending' } });
});
test('explicit revocation and expiry deny native token', async () => {
  const stored = await db.documentAccessToken.findFirst({ where: { documentId: doc.id } });
  await docs.revokeAccessToken(doc.id, stored.id, 'org');
  await expect(docs.validateAccessToken(link.token)).rejects.toThrow('revoked');
  const expired = await docs.generateAccessToken(doc.id, 'client', 'org');
  await db.documentAccessToken.updateMany({ where: { documentId: doc.id, revokedAt: null }, data: { expiresAt: new Date(0) } });
  await expect(docs.validateAccessToken(expired.token)).rejects.toThrow('expired');
});
const checkout = (user = 'client', org = 'org', success = 'http://localhost:3000/paid') => payments.createCheckoutSession(invoice.id, user, org, success, 'http://localhost:3000/cancel');
test('checkout denies wrong client, organization and redirect origin', async () => {
  await expect(checkout('owner')).rejects.toThrow('Not assigned');
  await expect(checkout('client', 'org', 'https://evil.invalid')).rejects.toThrow();
  await expect(checkout('client', 'other-org')).rejects.toThrow('Invoice not found');
  expect(checkouts.length).toBe(0);
});
test('native payment creates one-time Checkout and reuses open session', async () => {
  await checkout(); await checkout();
  expect(checkouts.length).toBe(1);
  expect(checkouts[0].params.mode).toBe('payment');
  expect(checkouts[0].params.line_items[0].price_data.unit_amount).toBe(1500);
  expect(checkouts[0].params.line_items[0].quantity).toBe(2);
  expect(checkouts[0].params.invoice_creation).toBeUndefined();
  expect(checkouts[0].options.stripeAccount).toBe('acct_fixture');
});
const event = { type: 'checkout.session.completed', account: 'acct_fixture', data: { object: { id: 'cs_fixture', metadata: { invoiceId: '', organizationId: 'org' }, payment_status: 'unpaid', amount_total: 3000 } } };
test('webhook ignores mismatched verified organization', async () => {
  event.data.object.metadata.invoiceId = invoice.id;
  await payments.handleWebhookEvent(event, 'other-org');
  expect((await db.invoice.findUnique({ where: { id: invoice.id } })).status).toBe('sent');
});
test('characterization: completed checkout with unpaid status marks invoice paid; duplicate is suppressed', async () => {
  await payments.handleWebhookEvent(event, 'org');
  await payments.handleWebhookEvent(event, 'org');
  expect((await db.invoice.findUnique({ where: { id: invoice.id } })).status).toBe('paid');
  expect(notifications).toBe(1);
});
