import http from 'node:http';
import {privateRead} from './config.mjs';
import {managedLifecyclePool} from '../signing/managed-store.mjs';
import {managedProviderApi} from '../signing/provider-api.mjs';
import {documentCompletion} from '../signing/completion.mjs';
import {completionQueue} from '../signing/completion-worker.mjs';
import {deliverySecrets} from '../signing/secrets.mjs';
import {sealedPdfVerifier} from '../signing/verify-pdf.mjs';
import {startDeliveryWorker} from '../signing/worker.mjs';
import {StorageClient} from '../../deployment/storage/client.mjs';
let pool,worker;
try{
 const config=JSON.parse(privateRead('/run/lifecycle/config.json'));
 if(Object.keys(config).sort().join()!=='connection,encryptionKey,providerToken,storageConfiguration,teamId'||! /^[a-f0-9]{64}$/.test(config.encryptionKey)||config.storageConfiguration?.projectRef!=='saedetvoolpdysiyjwvg'||config.storageConfiguration?.bucket!=='gc-atrium-private')throw Error();
 const trustPath='/run/lifecycle/signing-trust.pem';
 if(!privateRead(trustPath).startsWith('-----BEGIN CERTIFICATE-----'))throw Error();
 pool=await managedLifecyclePool(config.connection);
 const completion=documentCompletion({pool,api:managedProviderApi({origin:'http://documenso.signing.staging.growthcast.internal:3000',token:config.providerToken}),teamId:config.teamId,verifySealed:sealedPdfVerifier(trustPath),storage:new StorageClient({...config.storageConfiguration,maxBytes:16*1024*1024})});
 const queue=completionQueue({pool,completion,secrets:deliverySecrets(Buffer.from(config.encryptionKey,'hex'))});
 const server=http.createServer((req,res)=>{res.writeHead(req.method==='GET'&&req.url==='/health'?200:404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='GET'&&req.url==='/health'?'{"ready":true}':'{}');});
 server.headersTimeout=10000;server.requestTimeout=10000;server.maxConnections=4;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3004,'0.0.0.0',resolve);});
 worker=startDeliveryWorker({intervalMs:5000,delivery:{async runOnce(){const result=await queue.runOnce();if(result.failed)console.error('Some signing completions could not be verified');}},onFailure:()=>console.error('Signing completion polling failed')});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{const drained=worker.stop();server.close(()=>{void drained.then(()=>pool.end());});server.closeIdleConnections();setTimeout(()=>process.exit(1),110000).unref();});
 console.log('Staging signing completion worker ready');
}catch{await worker?.stop();await pool?.end().catch(()=>{});console.error('Signing lifecycle startup refused; private details suppressed');process.exitCode=1;}
