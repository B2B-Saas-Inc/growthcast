/* global process, Response */
import {createRuntimeProxy} from '../../../lib/runtime.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request){
  try{return await createRuntimeProxy(process.env)(request);}
  catch{return new Response('Unavailable',{status:503,headers:{'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
}
export {handle as GET,handle as HEAD,handle as POST,handle as PUT,handle as PATCH,handle as DELETE,handle as OPTIONS};
