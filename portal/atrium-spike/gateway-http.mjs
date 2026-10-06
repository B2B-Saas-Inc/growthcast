import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createHandler } from '../../gateway/src/server.mjs';
import { createStore } from '../../gateway/src/store.mjs';
import { authorizeAccount } from './claims.mjs';
const store = createStore(process.env.DATABASE_URL, { authorizeAccount });
// Wait only for the isolated fixture provisioner; never perform startup DDL.
assert(!existsSync('/credentials/owner-password'));
assert(!existsSync('/worker-credentials/password'));
const deadline=Date.now()+60000;
while(true) {
  try {await store.pool.query('SELECT 1 FROM account_grants LIMIT 0');break;}
  catch {if(Date.now()>deadline)throw Error('Gateway database readiness deadline exceeded');await new Promise(resolve=>setTimeout(resolve,200));}
}
assert.equal((await store.pool.query('SELECT current_user')).rows[0].current_user,'gc_gateway');
assert.equal((await store.pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
for(const sql of ['CREATE TABLE public.gateway_escape(id integer)','DELETE FROM sealed_artifacts','DELETE FROM grants','DELETE FROM provider_completions','SET ROLE postgres','SELECT copy_account_artifacts(NULL)'])await assert.rejects(()=>store.pool.query(sql));
console.log('Dedicated gateway identity verified; owner credentials, DDL, grant writes and canonical writers unavailable.');
// A bounded synthetic PDF transport, not a Documenso/signature substitute.
const upstream = http.createServer((_req,res) => {
  if(_req.url.startsWith('/sign/')) {
    res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'none'; script-src 'nonce-fixture123'; style-src 'unsafe-inline'"});
    return res.end('<!doctype html><html><head><title>Synthetic completed agreement</title><meta name="viewport" content="width=device-width"></head><body><h1>Synthetic completed agreement</h1><p>Document access verified.</p><script nonce="fixture123">document.title="Synthetic completed agreement";</script></body></html>');
  }
  res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end('%PDF synthetic account access fixture');
});
upstream.listen(8081, '127.0.0.1');
const server = http.createServer(createHandler({ store, origin: 'https://gateway:8080', upstream: 'http://127.0.0.1:8081', assets: new Set() }));
server.listen(8080, '0.0.0.0');
process.on('SIGTERM', () => { server.close(); upstream.close(); void store.pool.end(); });

if(process.env.PORTAL_BROWSER==='1') {
  const provider=process.env.PORTAL_PROVIDER==='1';
  const assets=provider?new Set(JSON.parse(readFileSync('/provider-runtime/assets.json','utf8'))):new Set();
  https.createServer({key:readFileSync('/runtime/tls.key'),cert:readFileSync('/runtime/tls.crt')},
    createHandler({store,origin:'https://signing.growthcast.test:8443',upstream:provider?'http://provider:3000':'http://127.0.0.1:8081',assets})).listen(8443,'0.0.0.0');
}
