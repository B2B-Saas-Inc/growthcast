import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createLedger} from './ledger.mjs';
import {ACCOUNT} from './receiver.mjs';
import {recover} from './recovery.mjs';
test('Postgres concurrent dedupe, quarantine, retry and noncurrent protection',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:8});
 let workerPool;
 try {
  await pool.query(await readFile(new URL('./migration.sql',import.meta.url),'utf8'));
  await pool.query("CREATE ROLE qa_receiver LOGIN PASSWORD 'local-only'; GRANT growthcast_payment_receiver TO qa_receiver; CREATE ROLE qa_browser LOGIN PASSWORD 'local-only';");
  const url=new URL(process.env.TEST_DATABASE_URL);url.username='qa_receiver';url.password='local-only';
  workerPool=new pg.Pool({connectionString:url.toString(),max:8});
  await assert.rejects(workerPool.query("INSERT INTO payment_private.bindings VALUES('acct_1ScttyEQy6YYD2FL','in_denied','cus_test','11111111-1111-4111-8111-111111111111',false)"));
  url.username='qa_browser';const browserPool=new pg.Pool({connectionString:url.toString()});
  try{await assert.rejects(browserPool.query('SELECT * FROM payment_private.events'));}finally{await browserPool.end();}
  let writes=0;let fail=false;
  const stripe={invoices:{retrieve:async id=>({id,customer:'cus_test',livemode:false,currency:'usd',status:'open',amount_due:100,amount_paid:0,amount_remaining:100})}};
  const attio={writeSummary:async()=>{writes++;if(fail)throw new Error('readback failed');}};
  const ledger=createLedger({pool:workerPool,stripe,attio});
  const event={account:ACCOUNT,id:'evt_one',type:'invoice.updated',invoice:'in_one'};
  await pool.query('INSERT INTO payment_private.bindings VALUES($1,$2,$3,$4,true)',[ACCOUNT,'in_one','cus_test','11111111-1111-4111-8111-111111111111']);
  await Promise.all(Array.from({length:12},()=>ledger.accept(event)));assert.equal(writes,1);
  assert.equal((await pool.query("SELECT state FROM payment_private.events WHERE event_id='evt_one'")).rows[0].state,'complete');
  await assert.rejects(ledger.accept({...event,invoice:'in_changed'}));
  await ledger.accept({...event,id:'evt_unmapped',invoice:'in_unmapped'});
  assert.equal((await pool.query("SELECT state FROM payment_private.events WHERE event_id='evt_unmapped'")).rows[0].state,'quarantined');
  fail=true;await assert.rejects(ledger.accept({...event,id:'evt_retry'}));
  assert.equal((await pool.query("SELECT state FROM payment_private.events WHERE event_id='evt_retry'")).rows[0].state,'pending');
  const attempts=writes;const preview=await recover({pool:workerPool,ledger});assert.equal(preview.attempted,0);assert.equal(writes,attempts);
  fail=false;const recovered=await recover({pool:workerPool,ledger,execute:true});assert.equal(recovered.succeeded,1);
  await assert.rejects(recover({pool:workerPool,ledger,limit:26}));
  assert.equal((await pool.query("SELECT state FROM payment_private.events WHERE event_id='evt_retry'")).rows[0].state,'complete');
  await pool.query('INSERT INTO payment_private.bindings VALUES($1,$2,$3,$4,false)',[ACCOUNT,'in_old','cus_test','11111111-1111-4111-8111-111111111111']);
  const before=writes;await ledger.accept({...event,id:'evt_old',invoice:'in_old'});assert.equal(writes,before);
 } finally {if(workerPool)await workerPool.end();await pool.end();}
});
