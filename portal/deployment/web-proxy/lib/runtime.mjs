import {createApiProxy} from './vercel-api-proxy.mjs';
// Read only inside the server request handler. Never import this from client code.
export function createRuntimeProxy(env,fetchImpl) {
  if(!env || Object.keys(env).some(key=>/^NEXT_PUBLIC_.*(?:PROOF|SECRET)|^VITE_.*(?:PROOF|SECRET)/.test(key)))throw Error('Server-only proxy configuration required');
  const {PORTAL_WEB_URL:webOrigin,PORTAL_API_URL:apiOrigin,PORTAL_API_ORIGIN_PROOF:originSecret}=env;
  return createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl});
}
