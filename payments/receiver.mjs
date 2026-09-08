import Stripe from 'stripe';
export const ACCOUNT = 'acct_1ScttyEQy6YYD2FL';
const events = new Set(['invoice.created','invoice.finalized','invoice.updated','invoice.paid','invoice.payment_failed','invoice.voided','invoice.marked_uncollectible']);
export function createReceiver({ secret, enabled, ledger, stripe = new Stripe('sk_test_not_used') }) {
 return async function receive(raw, signature) {
  if (!enabled || !secret?.startsWith('whsec_')) return { status:503 };
  if (!Buffer.isBuffer(raw) || raw.length > 262144) return { status:413 };
  let event;
  try { event = stripe.webhooks.constructEvent(raw, signature, secret, 300); }
  catch { return {status:400}; }
  if (event.livemode !== false || (event.account && event.account !== ACCOUNT)) return {status:403};
  if (!events.has(event.type)) return {status:200};
  const invoice = event.data?.object;
  if (!/^evt_[A-Za-z0-9]+$/.test(event.id) || invoice?.object !== 'invoice' || invoice.livemode !== false || !/^in_[A-Za-z0-9]+$/.test(invoice.id)) return {status:400};
  try {
   // Receipt and reconciliation run synchronously; failed transactions return 503 for Stripe retry.
   // Pending/quarantined receipts can also be retried by the operator recovery runner.
   await ledger.accept({account:ACCOUNT,id:event.id,type:event.type,invoice:invoice.id});
   return {status:200};
  } catch { return {status:503}; }
 };
}
export function invoiceSummary(invoice, binding) {
 if (invoice.id !== binding.invoice_id || invoice.customer !== binding.customer_id || invoice.livemode !== false || invoice.currency !== 'usd') throw new Error('invoice_scope');
 if (!['draft','open','paid','void','uncollectible'].includes(invoice.status)) throw new Error('invoice_status');
 for (const key of ['amount_due','amount_paid','amount_remaining']) if (!Number.isSafeInteger(invoice[key]) || invoice[key] < 0) throw new Error('invoice_amount');
 return { status:invoice.status, amount_due:invoice.amount_due, amount_paid:invoice.amount_paid, amount_remaining:invoice.amount_remaining };
}
