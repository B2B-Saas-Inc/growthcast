import { ACCOUNT, invoiceSummary } from './receiver.mjs';
export function createLedger({pool, stripe, attio}) {
 return {
  async accept(event) {
   // Durable minimal receipt first. Store no raw personal/payment payload or signing header.
   await pool.query(`INSERT INTO payment_private.events(account_id,event_id,event_type,invoice_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[event.account,event.id,event.type,event.invoice]);
   const db=await pool.connect();
   try {
    await db.query('BEGIN');
    const {rows:[receipt]}=await db.query('SELECT * FROM payment_private.events WHERE account_id=$1 AND event_id=$2 FOR UPDATE',[event.account,event.id]);
    if (receipt.invoice_id !== event.invoice || receipt.event_type !== event.type) throw new Error('event_conflict');
    if(receipt.state==='complete') {await db.query('COMMIT');return;}
    const {rows:[binding]}=await db.query('SELECT * FROM payment_private.bindings WHERE account_id=$1 AND invoice_id=$2',[event.account,event.invoice]);
    if(!binding) {
     await db.query("UPDATE payment_private.events SET state='quarantined' WHERE account_id=$1 AND event_id=$2",[event.account,event.id]);
     await db.query('COMMIT');return;
    }
    // All workers must take this lock BEFORE fetching Stripe/Attio state. Session pooler or direct
    // Postgres transactions required; never use an HTTP query endpoint for this transaction.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[ACCOUNT+':'+binding.engagement_id]);
    const freshBinding=(await db.query('SELECT * FROM payment_private.bindings WHERE account_id=$1 AND invoice_id=$2',[event.account,event.invoice])).rows[0];
    if(!freshBinding || freshBinding.engagement_id!==binding.engagement_id) throw new Error('binding_changed');
    const invoice=await stripe.invoices.retrieve(event.invoice);
    const summary=invoiceSummary(invoice,freshBinding);
    if(freshBinding.is_current) await attio.writeSummary(freshBinding,summary);
    await db.query(`INSERT INTO payment_private.invoices(account_id,invoice_id,status,currency,amount_due,amount_paid,amount_remaining) VALUES($1,$2,$3,'usd',$4,$5,$6) ON CONFLICT(account_id,invoice_id) DO UPDATE SET status=EXCLUDED.status,amount_due=EXCLUDED.amount_due,amount_paid=EXCLUDED.amount_paid,amount_remaining=EXCLUDED.amount_remaining,reconciled_at=now()`,[event.account,event.invoice,summary.status,summary.amount_due,summary.amount_paid,summary.amount_remaining]);
    await db.query("UPDATE payment_private.events SET state='complete',completed_at=now() WHERE account_id=$1 AND event_id=$2",[event.account,event.id]);
    await db.query('COMMIT');
   } catch(error) { await db.query('ROLLBACK');throw error; }
   finally {db.release();}
  }
 };
}
