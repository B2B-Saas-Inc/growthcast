import 'server-only';
import {createRuntimeProxy} from './growthcast/runtime.mjs';
// Server components use the same boundary as browser requests, without making
// a request back through Vercel Authentication or sharing cached account data.
export function portalFetch(input: string, init: RequestInit & {next?: unknown} = {}) {
  const canonical = process.env.PORTAL_WEB_URL;
  const url = new URL(input);
  if (!canonical || url.origin !== canonical || !url.pathname.startsWith('/api/')) {
    throw new Error('Invalid server API destination');
  }
  return createRuntimeProxy(process.env)(new Request(url, {...init, cache:'no-store'}));
}
