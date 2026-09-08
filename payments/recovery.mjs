import {ACCOUNT} from './receiver.mjs';
export async function recover({pool,ledger,execute=false,limit=5}) {
 if(!Number.isInteger(limit)||limit<1||limit>25)throw new Error('batch_limit');
 const {rows}=await pool.query(`SELECT account_id,event_id,event_type,invoice_id FROM payment_private.events WHERE account_id=$1 AND state='pending' ORDER BY received_at,event_id LIMIT $2`,[ACCOUNT,limit]);
 const result={selected:rows.length,attempted:0,succeeded:0,failed:0};
 if(execute)for(const row of rows){
  result.attempted++;
  try{await ledger.accept({account:row.account_id,id:row.event_id,type:row.event_type,invoice:row.invoice_id});result.succeeded++;}
  catch{result.failed++;}
 }
 // Succeeded means processing returned, possibly quarantined, not confirmed payment.
 const {rows:states}=await pool.query('SELECT state,count(*)::int AS count FROM payment_private.events WHERE account_id=$1 GROUP BY state',[ACCOUNT]);
 return {...result,states};
}
