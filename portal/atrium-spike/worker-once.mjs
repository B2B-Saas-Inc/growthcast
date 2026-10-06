import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createStore} from '../../gateway/src/store.mjs';
const deadline=Date.now()+180000;
while(!existsSync('/worker-control/ready')) {
  if(Date.now()>deadline)throw Error('Worker start deadline');
  await new Promise(r=>setTimeout(r,200));
}
// Verify the container has neither owner credentials nor signing private keys.
assert(!existsSync('/credentials/owner-password'));
assert(!existsSync('/provider-runtime'));
assert(!existsSync('/runtime'));
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.username,'gc_lifecycle');
const wrong=new URL(url);wrong.username='postgres';
const forbidden=createStore(wrong.href);
await assert.rejects(()=>forbidden.pool.query('SELECT 1'),/password authentication failed/);
await forbidden.pool.end();
const child=spawn('bun',['/app/apps/api/lifecycle-worker.mjs'],{env:{...process.env,LIFECYCLE_ONCE:'1',LIFECYCLE_RUN:'local-test',WORKER_ISOLATED:'1'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1024)child.kill();});
child.stderr.resume();
const code=await new Promise(resolve=>{child.on('error',()=>resolve(1));child.on('exit',resolve);});
assert.equal(code,0);
assert.deepEqual(JSON.parse(output),{state:'done'});
assert.ok(readFileSync('/worker-credentials/password','utf8').trim()===url.password,'Worker credential mismatch');
writeFileSync('/worker-control/result.json',JSON.stringify({state:'done',isolated:true}));
