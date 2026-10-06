import https from 'node:https';
import {recipientCss,accessPage} from './brand.mjs';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { allowRequest } from './policy.mjs';
import { createStore, digest } from './store.mjs';
import { createPinAccess } from './pin.mjs';

export const headers = {
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
};
const cookieName = '__Host-gc-sign';
const csrfName = '__Host-gc-csrf';
const bridge = `(()=>{const original=window.fetch;window.fetch=function(input,options){const request=new Request(input,options);if(new URL(request.url).origin===location.origin&&request.method==='POST'){const token=document.cookie.split('; ').find(v=>v.startsWith('${csrfName}='))?.slice(${csrfName.length + 1});if(token)request.headers.set('X-GrowthCast-CSRF',token);}return original.call(this,request);};})();`;
const enterScript = `const handoff=location.hash.slice(1);history.replaceState(null,'','/enter');fetch('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handoff})}).then(async r=>{if(!r.ok)throw Error();location.replace((await r.json()).path)}).catch(()=>{document.getElementById('status').textContent='This signing session is unavailable. Return to your proposal to try again.'});`;
const unlockScript = `const share=location.hash.slice(1);history.replaceState(null,'','/unlock');const showPin=()=>{document.querySelector('form').hidden=false;document.getElementById('instructions').textContent='Enter the eight-digit access code from your separate email to review and sign your document.';};fetch('/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({share,pin:''})}).then(async r=>{if(r.ok)location.replace((await r.json()).path);else showPin()}).catch(showPin);document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const button=document.querySelector('button');const pin=document.getElementById('pin');button.disabled=true;try{const r=await fetch('/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({share,pin:pin.value})});if(!r.ok)throw Error();location.replace((await r.json()).path)}catch{document.getElementById('status').textContent='Access unavailable. Check your link and PIN, or try again later.';pin.value='';pin.focus();button.disabled=false;}});`;
function cookie(req, name) {
  const values = (req.headers.cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
async function readBody(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 131072) throw new Error('Bounded request');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function csrfValid(req, expected) {
  const value = req.headers['x-growthcast-csrf'];
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(digest(value)), Buffer.from(expected));
}
export function createHandler({ store, origin, upstream, assets, observe = () => {}, pinAccess = createPinAccess(store), embedParent='https://portal.growthcast.test:9443',brandAssets=new Map() }) {
  if(new URL(embedParent).origin!==embedParent||!embedParent.startsWith('https://'))throw Error('Exact HTTPS embed parent required');
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Exact HTTPS origin required');
  if (new URL(upstream).origin !== upstream) throw new Error('Exact upstream origin required');
  return async (req, res) => {
    Object.entries(headers).forEach(([k,v]) => res.setHeader(k,v));
    const deny = (status = 404) => { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end('Signing session unavailable.'); };
    try {
      if (req.headers.host !== new URL(origin).host || req.headers.authorization || req.headers.upgrade) return deny();
      const sameSiteEmbed=req.headers['sec-fetch-site']==='same-site' && req.method==='GET' && /^\/embed\/sign\/[A-Za-z0-9_-]+$/.test(req.url);
      if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']) && !sameSiteEmbed && !(['/enter','/unlock'].includes(req.url) && req.method==='GET')) return deny();
      if(req.method==='GET' && brandAssets.has(req.url)){const asset=brandAssets.get(req.url);res.writeHead(200,{'Content-Type':asset.contentType});return res.end(asset.bytes);}
      if(req.url==='/growthcast.css' && req.method==='GET'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(recipientCss);}
      if (req.url==='/unlock' && req.method==='GET') {
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(accessPage);
      }
      if(req.url==='/unlock.js' && req.method==='GET') {res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(unlockScript);}
      if(req.url==='/unlock.css' && req.method==='GET') {res.writeHead(200,{'Content-Type':'text/css'});return res.end(recipientCss);}
      if (req.url === '/enter' && req.method === 'GET') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><html lang="en"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width"><title>GrowthCast signing</title><link rel="icon" type="image/jpeg" href="/growthcast-favicon-v2.jpg"><p id="status" role="status">Opening your signing session…</p><script src="/enter.js"></script></html>');
      }
      if (req.url === '/enter.js' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(enterScript); }
      if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['content-type']?.split(';')[0] !== 'application/json')) return deny(403);
      if(req.url==='/unlock' && req.method==='POST') {
        const input=JSON.parse(await readBody(req));
        if(!input || Object.keys(input).sort().join()!=='pin,share')return deny();
        // No untrusted forwarding header may choose its own limiter source.
        const handoff=await pinAccess.unlock(input.share,input.pin,req.socket.remoteAddress);
        if(!handoff)return deny();
        res.writeHead(200,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({path:'/enter#'+handoff}));
      }
      if (req.url === '/session' && req.method === 'POST') {
        const input = JSON.parse(await readBody(req));
        if (!input || Object.keys(input).join() !== 'handoff' || typeof input.handoff !== 'string') return deny();
        const session = await store.redeem(input.handoff);
        if (!session) return deny();
        res.setHeader('Set-Cookie', [
          `${cookieName}=${session.token}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`,
          `${csrfName}=${session.csrf}; Path=/; Max-Age=3600; Secure; SameSite=Strict`,
        ]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ path: `/sign/${session.binding.recipientToken}` }));
      }
      const auth = await store.authorize(cookie(req, cookieName));
      if (!auth) return deny();
      if (req.url === '/api/auth/session-json' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ json: { isAuthenticated: false, session: null, user: null } }));
      }
      if (req.url === '/gateway-client.js' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(bridge);
      }
      if (req.method === 'POST' && !csrfValid(req, auth.csrfHash)) return deny(403);
      const body = req.method === 'POST' ? await readBody(req) : '';
      if (!allowRequest(req.url, req.method, body, auth.binding, assets)) {
        // Diagnostic categories only, never raw URLs, inputs, cookies or tokens.
        observe('policy-denied'); return deny();
      }
      const forwarded = { 'Accept': req.headers.accept || '*/*' };
      if (req.method === 'POST') { forwarded['Content-Type'] = 'application/json'; forwarded.Origin = origin; }
      if (req.headers.range) {
        if (!/^bytes=\d+-\d*$/.test(req.headers.range)) return deny();
        forwarded.Range = req.headers.range;
      }
      // The native dialog omits dataId; resolve only to the grant's approved or
      // independently verified sealed dataId, never the provider's mutable pointer.
      let providerPath=req.url;
      for(const item of auth.binding.items)for(const [label,version] of [['original','initial'],['signed','current']]){
        if(req.url===`/api/files/token/${auth.binding.recipientToken}/envelopeItem/${item.id}/download/${label}`)
          providerPath=`/api/files/token/${auth.binding.recipientToken}/envelope/${auth.binding.envelopeId}/envelopeItem/${item.id}/dataId/${item.dataId}/${version}/item.pdf`;
      }
      const response = await fetch(upstream + providerPath, {
        method: req.method, headers: forwarded, body: body || undefined,
        redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
      // Never relay provider cookies, cache validators, auth headers or external redirects.
      if (response.status >= 300 && response.status < 400) {
        const target = new URL(response.headers.get('location') || '/', upstream);
        if (![upstream, origin].includes(target.origin) || !allowRequest(target.pathname + target.search, 'GET', '', auth.binding, assets)) return deny();
        res.writeHead(response.status, { Location: target.pathname + target.search }); return res.end();
      }
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const chunks = [];
      let size = 0;
      for await (const part of response.body || []) {
        size += part.length;
        if (size > 16777216) throw new Error('Bounded response');
        chunks.push(part);
      }
      let bytes = Buffer.concat(chunks);
      let csp = response.headers.get('content-security-policy');
      if (contentType.includes('text/html') && req.method !== 'HEAD') {
        let html = bytes.toString('utf8');
        const nonce = html.match(/nonce="([A-Za-z0-9+/=_-]+)"/)?.[1];
        if (!nonce || !csp?.includes(`'nonce-${nonce}'`)) throw new Error('Missing upstream CSP nonce');
        html = html.replace('<head>', `<head><link rel="stylesheet" href="/growthcast.css"><script nonce="${nonce}" src="/gateway-client.js"></script>`);
        bytes = Buffer.from(html);
      }
      if (csp) {
        csp = csp.replace(/frame-ancestors[^;]*(;|$)/g, '');
        const embedded=req.url===`/embed/sign/${auth.binding.recipientToken}`;
        res.setHeader('Content-Security-Policy', csp + (embedded?`; frame-ancestors ${embedParent}`:"; frame-ancestors 'none'"));
        if(embedded)res.removeHeader('X-Frame-Options');
      }
      // A response never outlives a grant revoked while the provider was responding.
      if (!await store.authorize(cookie(req, cookieName))) return deny();
      res.writeHead(response.status, { 'Content-Type': contentType });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { observe('request-failed'); deny(503); }
  };
}

if (process.env.GATEWAY_RUN === 'local-test') {
  const store = createStore(process.env.DATABASE_URL);
  const assets = new Set(JSON.parse(readFileSync('/runtime/assets.json','utf8')));
  const handler = createHandler({ store, origin: process.env.GATEWAY_ORIGIN,
    upstream: 'http://documenso:3000', assets });
  const server = https.createServer({ key: readFileSync('/runtime/tls.key'), cert: readFileSync('/runtime/tls.crt') }, handler);
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: private, no-store\r\nX-Robots-Tag: noindex, nofollow\r\nContent-Length: 0\r\n\r\n');
  });
  server.listen(8443, '0.0.0.0');
  process.on('SIGTERM', () => { server.close(); void store.pool.end(); });
}
