import { createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const PROPOSAL_PATH = '/clients/proposals/photoshelter';
const COOKIE = '__Secure-photoshelter_proposal';
const SESSION_SECONDS = 8 * 60 * 60;
const attempts = new Map<string, { count: number; reset: number }>();
type Request = { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status(code: number): Response; setHeader(name: string, value: string): void; send(body: string | Buffer): void; end(): void };
const header = (req: Request, key: string) => String(req.headers[key] || '');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function equal(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function signSession(secret: string, pinHash: string, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${createHmac('sha256', secret).update(`${pinHash}:${payload}`).digest('hex')}`;
}
export function validSession(value: string, secret: string, pinHash: string, now = Date.now()) {
  if (!/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const [expires, nonce, mac] = value.split('.');
  const seconds = Math.floor(now / 1000);
  if (Number(expires) <= seconds || Number(expires) > seconds + SESSION_SECONDS) return false;
  return equal(mac, createHmac('sha256', secret).update(`${pinHash}:${expires}.${nonce}`).digest('hex'));
}
function cookie(req: Request) {
  return header(req, 'cookie').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
function gate(message = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Private proposal | GrowthCast</title><style>@font-face{font-family:Manrope;src:url('/fonts/manrope-400.ttf')}@font-face{font-family:Manrope;src:url('/fonts/manrope-700.ttf');font-weight:700}@font-face{font-family:'DM Mono';src:url('/fonts/dm-mono-400.ttf')}*{box-sizing:border-box}body{margin:0;background:#f4f1e9;color:#242426;font-family:Manrope,Arial,sans-serif;min-height:100svh;display:flex;flex-direction:column}header{padding:30px 7vw;border-bottom:1px solid #d7d2c7;font-size:25px;font-weight:700;letter-spacing:-1px}main{width:min(100% - 40px,460px);margin:auto;padding:55px 0 80px}.label{font:11px 'DM Mono',monospace;color:#b63f25;letter-spacing:1.5px}h1{font-size:42px;line-height:1.12;letter-spacing:-1.7px;margin:20px 0}p{color:#625e57;line-height:1.6}label{display:block;font-size:14px;font-weight:700;margin:28px 0 10px}input{width:100%;border:1px solid #b4aea3;background:#fffdf8;padding:17px;font:24px 'DM Mono',monospace;letter-spacing:8px;color:#242426;border-radius:0}input:focus{outline:2px solid #b63f25;outline-offset:2px}button{width:100%;border:0;background:#242426;color:white;margin-top:18px;padding:18px;font:13px 'DM Mono',monospace;cursor:pointer}button:hover{background:#b63f25}.error{min-height:24px;color:#a63820;font-size:14px}footer{padding:25px;text-align:center;font:10px 'DM Mono',monospace;color:#625e57}</style></head><body><header>GrowthCast</header><main><div class="label">PRIVATE CLIENT PROPOSAL</div><h1>Prepared for<br>PhotoShelter.</h1><p>Enter your PIN to view the proposal.</p><form method="post" action="${PROPOSAL_PATH}"><label for="pin">Access PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required aria-describedby="error"><button type="submit">View proposal →</button><p class="error" id="error" role="status">${message}</p></form></main><footer>GROWTHCAST · CONFIDENTIAL</footer></body></html>`;
}
function redirect(res: Response) { res.setHeader('Location', PROPOSAL_PATH); res.status(303).end(); }
export function prepareProposalHtml(source: string) {
  return source
    .replace('.cover{background:#f4f1e9;', '.cover{background:white;')
    .replace('</style>', '.hosted-lock{position:fixed;z-index:9999;right:14px;bottom:14px;margin:0}.hosted-lock button{border:1px solid #fff;background:#242426;color:#fff;padding:8px 12px;font:11px Manrope,Arial,sans-serif;cursor:pointer}</style>')
    .replace('</body>', `<form class="hosted-lock" method="post" action="${PROPOSAL_PATH}"><input type="hidden" name="action" value="logout"><button type="submit">Lock</button></form></body>`);
}
export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const csp = "default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; connect-src 'none'";
  res.setHeader('Content-Security-Policy', csp);
  const secret = process.env.PHOTOSHELTER_SESSION_SECRET || '';
  const pinHash = process.env.PHOTOSHELTER_PIN_SHA256 || '';
  if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(pinHash)) return res.status(503).send(gate('This proposal is temporarily unavailable.'));
  const method = req.method || 'GET';
  if (!['GET', 'HEAD', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, HEAD, POST'); return res.status(405).end(); }
  if (method === 'POST') {
    const allowedOrigins = ['https://growthcast.app', ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])];
    if (!allowedOrigins.includes(header(req, 'origin'))) return res.status(403).send(gate('Please open this page again and retry.'));
    if (!header(req, 'content-type').startsWith('application/x-www-form-urlencoded')) return res.status(415).end();
    if (Number(header(req, 'content-length')) > 1024 || JSON.stringify(req.body ?? '').length > 1024) return res.status(413).end();
    const form = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {});
    if (form.action === 'logout') { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`); return redirect(res); }
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.reset <= now) attempts.delete(key);
    // Defense in depth per warm function instance; not a global distributed limit.
    const key = digest(header(req, 'x-vercel-forwarded-for') || header(req, 'x-forwarded-for') || 'unknown');
    const entry = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
    if (entry.count >= 10 || attempts.size >= 10000) { res.setHeader('Retry-After', '900'); return res.status(429).send(gate('Too many attempts. Please try again in 15 minutes.')); }
    entry.count++; attempts.set(key, entry);
    const pin = typeof form.pin === 'string' ? form.pin : '';
    if (!/^\d{4}$/.test(pin) || !equal(digest(pin), pinHash)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return res.status(401).send(gate('That PIN is incorrect. Please try again.'));
    }
    attempts.delete(key);
    res.setHeader('Set-Cookie', `${COOKIE}=${signSession(secret, pinHash)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
    return redirect(res);
  }
  const authenticated = validSession(cookie(req), secret, pinHash);
  if (!authenticated) return method === 'HEAD' ? res.status(200).end() : res.status(200).send(gate());
  try {
    const key = process.env.PHOTOSHELTER_CONTENT_KEY || '';
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Content key unavailable');
    const encrypted = await readFile(join(process.cwd(), 'server-assets', 'photoshelter-proposal.enc'));
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]);
    const content = JSON.parse(gunzipSync(plaintext).toString('utf8')) as { html: string };
    const html = prepareProposalHtml(content.html);
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    res.setHeader('Content-Security-Policy', `${csp}; script-src ${hashes.join(' ')}`);
    return method === 'HEAD' ? res.status(200).end() : res.status(200).send(html);
  } catch { return res.status(503).send(gate('This proposal is temporarily unavailable.')); }
}
