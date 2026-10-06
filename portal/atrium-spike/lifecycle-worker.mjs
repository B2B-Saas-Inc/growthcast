import { setTimeout as delay } from 'node:timers/promises';
import { createStore } from '../../gateway/src/store.mjs';
import { runReconciliation } from './lifecycle.mjs';
import { providerFixture } from './provider-fixture.mjs';

// Local harness entrypoint only. Production credential/proof provisioning is
// deliberately not inferred from these disposable fixture files.
const url=new URL(process.env.DATABASE_URL);
if(process.env.LIFECYCLE_RUN!=='local-test'||url.username!=='gc_lifecycle'||url.hostname!=='database'||url.pathname!=='/atrium_test')throw Error('Restricted disposable lifecycle database required');
const store=createStore(url.href);
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
try {
  do {
    let state;
    try {
      const result=await runReconciliation(store.pool,async({teamId,organizationId})=>{
        const fixture=providerFixture('client@growthcast.invalid');
        if(teamId!==fixture.teamId||organizationId!=='http-org')throw Error('Unconfigured provider scope');
        return fixture.api;
      });
      state=result.state;
    } catch { state='database-unavailable'; }
    // Never print raw provider/database errors or document identifiers.
    process.stdout.write(JSON.stringify({state})+'\n');
    if(process.env.LIFECYCLE_ONCE==='1') {
      if(state==='database-unavailable')process.exitCode=1;
      break;
    }
    if(!stopping)await delay(1000);
  } while(!stopping);
} finally {await store.pool.end();}
