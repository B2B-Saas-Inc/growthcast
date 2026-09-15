import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import handler, { signSession, validSession, PROPOSAL_PATH } from '../../api/bluealpha-proposal';
const secret = 'a'.repeat(64);
const hash = createHash('sha256').update('12345678').digest('hex');
const headers = { origin: 'https://growthcast.app', 'content-type': 'application/x-www-form-urlencoded' };
function response() {
  return { code: 200, headers: {} as Record<string, string>, body: '' as string | Buffer,
    status(code: number) { this.code = code; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    send(body: string | Buffer) { this.body = body; }, end() {} };
}
function configured() { vi.stubEnv('BLUEALPHA_SESSION_SECRET', secret); vi.stubEnv('BLUEALPHA_PIN_SHA256', hash); }
afterEach(() => vi.unstubAllEnvs());
describe('private proposal boundary', () => {
  it('accepts authentic sessions and rejects tampering, expiry and PIN rotation', () => {
    const now = 1_800_000_000_000;
    const token = signSession(secret, hash, now);
    expect(validSession(token, secret, hash, now)).toBe(true);
    expect(validSession(token + 'x', secret, hash, now)).toBe(false);
    expect(validSession(token, secret, hash, now + 8 * 3600_000)).toBe(false);
    expect(validSession(token, secret, 'b'.repeat(64), now)).toBe(false);
    expect(validSession(token, 'wrong', hash, now)).toBe(false);
  });
  it('fails closed without configuration', async () => {
    vi.stubEnv('BLUEALPHA_SESSION_SECRET', '');const res=response();
    await handler({method:'GET',headers:{}},res);expect(res.code).toBe(503);
  });
  it('never exposes HTML or PDF to anonymous visitors, including direct API requests', async () => {
    configured();
    for (const url of [PROPOSAL_PATH, '/api/bluealpha-proposal', PROPOSAL_PATH+'?download=1']) {
      const res=response();await handler({method:'GET',url,headers:{}},res);
      expect(res.body).toContain('Access PIN');expect(res.body).not.toContain('$15,000');
      expect(res.headers['Cache-Control']).toContain('no-store');expect(res.headers['X-Robots-Tag']).toContain('noindex');
      expect(res.body).not.toContain(hash);expect(res.body).not.toContain(secret);
    }
  });
  it('requires an allowed origin and rejects wrong PINs', async () => {
    configured();const csrf=response();await handler({method:'POST',headers:{...headers,origin:'https://evil.example'},body:{pin:'12345678'}},csrf);expect(csrf.code).toBe(403);
    const wrong=response();await handler({method:'POST',headers,body:{pin:'00000000'}},wrong);expect(wrong.code).toBe(401);expect(wrong.headers['Set-Cookie']).toBeUndefined();
  });
  it('sets an expiring secure session after correct PIN and clears it on logout', async () => {
    configured();const res=response();await handler({method:'POST',headers,body:'pin=12345678'},res);
    expect(res.code).toBe(303);expect(res.headers.Location).toBe(PROPOSAL_PATH);
    expect(res.headers['Set-Cookie']).toContain('HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
    const logout=response();await handler({method:'POST',headers,body:{action:'logout'}},logout);expect(logout.headers['Set-Cookie']).toContain('Max-Age=0');
  });
  it('returns unavailable rather than leaking data when encrypted content is missing or misconfigured', async () => {
    configured();vi.stubEnv('BLUEALPHA_CONTENT_KEY','');const token=signSession(secret,hash);
    const res=response();await handler({method:'GET',headers:{cookie:`__Secure-bluealpha_proposal=${token}`}},res);expect(res.code).toBe(503);
  });
  it('bounds repeated failed attempts', async () => {
    configured();const req={method:'POST',headers:{...headers,'x-vercel-forwarded-for':'192.0.2.99'},body:{pin:'00000000'}};
    for(let i=0;i<10;i++) await handler(req,response());
    const res=response();await handler(req,res);expect(res.code).toBe(429);expect(res.headers['Retry-After']).toBe('900');
  },10000);
});
