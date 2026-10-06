import {timingSafeEqual} from 'node:crypto';
// Limited staging release: staff review only. No guest grant, PIN or dispatch routes.
export function staffBoundary({handler,originProof,portalOrigin,deliveryEnabled=false}) {
 if(typeof deliveryEnabled!=='boolean'||typeof handler!=='function'||! /^[a-f0-9]{64}$/.test(originProof)||typeof portalOrigin!=='string'||!portalOrigin.startsWith('https://')||new URL(portalOrigin).origin!==portalOrigin)throw Error('Explicit private ingress configuration required');
 const post=new Set(['clients','recipients','documents','upload','preview','approve','edit','delete']);if(deliveryEnabled)post.add('send');
 const get=new Set(['catalog','artifact','fields','capabilities','record','placeholders']);if(deliveryEnabled)get.add('send-status');
 return (req,res)=>{
  const deny=()=>{res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});res.end('{"error":"Document route unavailable"}');};
  const proof=req.headers['x-growthcast-origin'];
  let proofs=0;for(let i=0;i<req.rawHeaders.length;i+=2)if(req.rawHeaders[i].toLowerCase()==='x-growthcast-origin')proofs++;
  if(proofs!==1||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||!timingSafeEqual(Buffer.from(proof),Buffer.from(originProof)))return deny();
  const url=req.url??'',prefix='/api/guest/staff/';
  if(!url.startsWith(prefix))return deny();
  const route=url.slice(prefix.length),path=route.split('?')[0];
  if(!(req.method==='POST'&&post.has(route)||req.method==='GET'&&get.has(path)))return deny();
  // Identity and source forwarding headers never become authorization inputs.
  for(const name of Object.keys(req.headers))if(name.startsWith('x-forwarded-')||name==='forwarded'||name==='x-growthcast-origin')delete req.headers[name];
  req.headers.host=new URL(portalOrigin).host;
  return handler(req,res);
 };
}
