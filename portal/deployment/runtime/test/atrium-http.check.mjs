import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base = 'http://provider:3001';
const proof = readFileSync('/run/origin/api-origin','utf8').trim();
const request = (path, options = {}) => fetch(base + path, {redirect:'manual', signal:AbortSignal.timeout(10000), ...options,
  headers:{'x-growthcast-origin':proof,...options.headers}});
for (const headers of [{}, {'x-growthcast-origin':'x'.repeat(64)}, {'x-forwarded-for':'127.0.0.1'}, {'x-growthcast-origin':proof+', '+proof}]) {
  const denied = await fetch(base+'/api/health',{headers});
  assert.equal(denied.status,403); assert.equal(denied.headers.get('cache-control'),'private, no-store');
}
assert.equal((await request('/api/auth/sign-up/email',{method:'POST',headers:{Origin:'https://untrusted.invalid'}})).status,403);
const health = await request('/api/health');
assert.equal(health.status,200);
assert.equal((await health.json()).database,'connected');
assert.deepEqual(await (await request('/api/health/config')).json(), {billingEnabled:false,signupEnabled:false});
for (const path of ['/api/documents/project/synthetic-project','/api/files/project/synthetic-project','/api/clients','/api/setup/status']) {
  assert.equal((await request(path)).status,401,path);
}
const signup = await request('/api/auth/sign-up/email', {method:'POST',
  headers:{Origin:'https://portal.growthcast.invalid','Content-Type':'application/json'},
  body:JSON.stringify({name:'Uninvited synthetic user',email:'blocked@growthcast.invalid',password:'synthetic-password-1234'})});
assert.equal(signup.status,403);
console.log('Real Atrium API: database health, disabled billing/signup, private-route denials and uninvited signup denial passed.');
