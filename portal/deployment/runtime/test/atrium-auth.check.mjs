import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const mode = process.argv[2];
const statePath = '/evidence/session.json';
const proof = readFileSync('/run/origin/api-origin','utf8').trim();
const cookies = new Map(mode === 'begin' ? [] : JSON.parse(readFileSync(statePath,'utf8')).cookies);
let identity;
async function request(path, body) {
  const response = await fetch('http://provider:3001'+path, {method:body ? 'POST' : 'GET',redirect:'manual',
    signal:AbortSignal.timeout(10000),headers:{Origin:'https://portal.growthcast.invalid','x-growthcast-origin':proof,
      Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; '),'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined});
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';')[0], index = pair.indexOf('=');
    const key = pair.slice(0,index), value = pair.slice(index+1);
    if (key.includes('session_token') && value) {
      assert.match(raw,/;\s*HttpOnly/i); assert.match(raw,/;\s*Secure/i); assert.match(raw,/;\s*SameSite=Lax/i);
    }
    if (value) cookies.set(key,value); else cookies.delete(key);
  }
  return response;
}
async function session() {
  const response = await request('/api/auth/get-session'); assert.equal(response.status,200);
  return response.json();
}
if (mode === 'begin') {
  const expired = await request('/api/auth/sign-up/email',{name:'Expired invite',email:'expired@growthcast.invalid',password:'synthetic-password-1234'});
  assert.equal(expired.status,403);
  const signup = await request('/api/auth/sign-up/email',{name:'Invited synthetic user',email:'invited@growthcast.invalid',password:'synthetic-password-1234'});
  assert.equal(signup.status,200);
  identity = (await signup.json()).user.id;
  assert.equal(await session(),null,'Unverified signup must not create a session');
  let messages = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    messages = await (await fetch('http://mail:1080/email')).json();
    if (messages.length) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(messages.length,1,'Exactly one verification email expected');
  assert.deepEqual(messages[0].to.map(to=>to.address),['invited@growthcast.invalid']);
  const message = await (await fetch('http://mail:1080/email/'+encodeURIComponent(messages[0].id))).json();
  const link = message.html.match(/https?:[^"\s<>]*verify-email[^"\s<>]*/)?.[0]?.replaceAll('&amp;','&');
  assert(link,'Verification mail must contain the actual verification link');
  const parsed = new URL(link);
  assert.equal(parsed.origin,'https://api.growthcast.invalid');
  const tampered = new URL(parsed); tampered.searchParams.set('token','invalid');
  await request(tampered.pathname+tampered.search);
  assert.equal(await session(),null,'Tampering must not mint a verified session');
  const verified = await request(parsed.pathname+parsed.search);
  assert([200,302].includes(verified.status));
  const authenticated = await session();
  assert.equal(authenticated.user.id,identity); assert.equal(authenticated.user.emailVerified,true);
  assert.equal((await request('/api/auth/organization/accept-invitation',{invitationId:'runtime-invite'})).status,200);
  assert.equal((await request('/api/auth/organization/set-active',{organizationId:'runtime-org'})).status,200);
  assert.equal((await session()).session.activeOrganizationId,'runtime-org');
  const organizations = await (await request('/api/auth/organization/list')).json();
  assert.deepEqual(organizations.map(org=>org.id),['runtime-org']);
  assert.equal((await request('/api/auth/organization/set-active',{organizationId:'runtime-other-org'})).status,403);
  // Pinned Better Auth clears active organization after denied membership.
  assert.equal((await session()).session.activeOrganizationId,null);
  assert.equal((await request('/api/auth/organization/set-active',{organizationId:'runtime-org'})).status,200);
  const organization = await request('/api/auth/organization/create',{name:'Forbidden org',slug:'forbidden-synthetic-org'});
  assert.equal(organization.status,403);
  writeFileSync(statePath,JSON.stringify({identity,cookies:[...cookies]}),{mode:0o600});
  console.log('Invited signup, captured SMTP verification, tamper denial, secure session cookie, invitation acceptance and organization restrictions passed.');
} else {
  identity = JSON.parse(readFileSync(statePath,'utf8')).identity;
  const authenticated = await session();
  assert.equal(authenticated.user.id,identity); assert.equal(authenticated.user.emailVerified,true);
  assert.equal(authenticated.session.activeOrganizationId,'runtime-org');
  if (mode === 'logout') {
    const stale = [...cookies];
    assert.equal((await request('/api/auth/sign-out',{})).status,200);
    assert.equal(await session(),null);
    cookies.clear(); for (const [key,value] of stale) cookies.set(key,value);
    assert.equal(await session(),null,'Revoked session must not replay');
    cookies.clear();
    const signin = await request('/api/auth/sign-in/email',{email:'invited@growthcast.invalid',password:'synthetic-password-1234'});
    assert.equal(signin.status,200); assert.equal((await session()).user.id,identity);
    await request('/api/auth/sign-out',{});
    console.log('Sign-out, stale-session replay denial and existing-account sign-in passed.');
  } else {
    assert.equal(mode,'resume');
    console.log('Verified account and session survived API restart.');
  }
}
