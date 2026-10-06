import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {staffBoundary} from './boundary.mjs';
const proof='a'.repeat(64);
const start=async(deliveryEnabled=false)=>{
  const server=http.createServer(staffBoundary({deliveryEnabled,originProof:proof,portalOrigin:'https://clients.staging.growthcast.app',handler:(req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({host:req.headers.host,forwarded:req.headers['x-forwarded-for']??null}));}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,call:(path,method='GET',headers={'x-growthcast-origin':proof})=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,headers},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(data)}));});req.on('error',reject);req.end();
 })};
};
test('missing, malformed and duplicate private ingress proofs are refused',async()=>{const {server,call}=await start();try{for(const headers of [{},{'x-growthcast-origin':'b'.repeat(64)},{'x-growthcast-origin':[proof,proof]}]){const r=await call('/api/guest/staff/catalog','GET',headers);assert.equal(r.status,404);assert.equal(r.headers['cache-control'],'private, no-store');}}finally{await new Promise(r=>server.close(r));}});
test('limited release blocks guest, dispatch, PIN and legacy version registration routes',async()=>{const {server,call}=await start();try{for(const path of ['/guest','/api/guest/unlock','/api/guest/artifact','/api/guest/staff/pin','/api/guest/staff/dispatch','/api/guest/staff/revoke','/api/guest/staff/versions','/api/guest/staff/%61pprove','/api/guest/staff/approve?x=1'])for(const method of ['GET','POST'])assert.equal((await call(path,method)).status,404);}finally{await new Promise(r=>server.close(r));}});
test('allowed staff routes retain application authorization and discard source spoofing',async()=>{const {server,call}=await start();try{for(const path of ['clients','recipients','documents','upload','preview','approve'])assert.equal((await call('/api/guest/staff/'+path,'POST')).status,200);const r=await call('/api/guest/staff/catalog?limit=25','GET',{'x-growthcast-origin':proof,'x-forwarded-for':'spoofed',host:'spoofed.invalid'});assert.deepEqual(r.body,{host:'clients.staging.growthcast.app',forwarded:null});assert.equal((await call('/api/guest/staff/artifact?versionId=x')).status,200);}finally{await new Promise(r=>server.close(r));}});
test('send routes require explicit delivery configuration and private origin proof',async()=>{
 for(const enabled of [false,true]){const {server,call}=await start(enabled);try{
  assert.equal((await call('/api/guest/staff/capabilities')).status,200);
  assert.equal((await call('/api/guest/staff/send','POST')).status,enabled?200:404);
  assert.equal((await call('/api/guest/staff/send-status?approvalId=x')).status,enabled?200:404);
  assert.equal((await call('/api/guest/staff/send','POST',{})).status,404);
  assert.equal((await call('/api/guest/unlock','POST')).status,404);
 }finally{await new Promise(r=>server.close(r));}}
});
