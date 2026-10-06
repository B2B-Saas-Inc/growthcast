import {timingSafeEqual} from 'node:crypto';
// Install before native API controllers in the production backend adapter.
export function originAuthorized(headers,secret) {
  if(!/^[a-zA-Z0-9]{64}$/.test(secret??''))throw Error('Origin credential required');
  const supplied=headers.get('x-growthcast-origin');
  return typeof supplied==='string'&&/^[a-zA-Z0-9]{64}$/.test(supplied)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(secret));
}
