import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {blockers} from './release-check.mjs';
import {files} from './migrate.mjs';
test('reviewed migrations have valid locked content and ordered unique versions',async()=>{
  const entries=await files();
  assert.equal(entries.length,5);
  assert.deepEqual(entries.map(e=>e.name.slice(0,3)),['001','002','003','004','005']);
});
test('checked-in release configuration blocks staging and production',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./release.json',import.meta.url),'utf8'));
  for(const PORTAL_ENV of ['staging','production']) {
    const errors=blockers(manifest,{PORTAL_ENV});
    assert(errors.includes('release approval'));assert(!errors.includes('atriumHostingDecision'));assert(!errors.includes('documensoLicenseDecision'));assert(errors.includes('certificatePolicy'));
    assert(errors.includes('documenso image digest'));
  }
});
test('release preflight rejects floating images, insecure origins and shared signing origin',()=>{
  const images=Object.fromEntries(['web','api','gateway','worker','documenso'].map(s=>[s,'registry.example/'+s+'@sha256:'+'a'.repeat(64)]));
  const candidate={schemaVersion:1,status:'approved',atriumHostingDecision:'fixture-review',documensoLicenseDecision:'fixture-review',certificatePolicy:'fixture-policy',managedSecretProvider:'fixture-provider',images};
  const env={PORTAL_ENV:'staging',WEB_URL:'https://clients.example.test',API_URL:'https://clients.example.test',GATEWAY_ORIGIN:'https://sign.example.test',ALLOW_SIGNUPS:'false',SECURE_COOKIES:'true'};
  assert.deepEqual(blockers(candidate,env),[]);
  assert(blockers({...candidate,images:{...images,api:'image:latest'}},env).includes('api image digest'));
  assert(blockers(candidate,{...env,WEB_URL:'http://clients.example.test'}).includes('WEB_URL'));
  assert(blockers(candidate,{...env,GATEWAY_ORIGIN:env.WEB_URL}).includes('separate signing origin'));
});
