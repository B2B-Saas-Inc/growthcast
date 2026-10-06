import http from 'node:http';
import {readFileSync} from 'node:fs';
import {privateRead} from './config.mjs';
import {managedGatewayStore} from '../signing/managed-store.mjs';
import {deliveryGateway} from '../signing/gateway.mjs';
import {createHandler} from '../../gateway/src/server.mjs';
let store;
try{
 const config=JSON.parse(privateRead('/run/gateway/connection.json'));
 if(Object.keys(config).sort().join()!=='ca,environment,projectRef,url')throw Error();
 store=await managedGatewayStore(config);
 const gateway=deliveryGateway({store,pool:store.pool,environment:'staging'});
 const assets=JSON.parse(readFileSync('/app/provider-assets.json','utf8'));
 if(!Array.isArray(assets)||!assets.length||assets.some(x=>typeof x!=='string'||!x.startsWith('/')||x.startsWith('//')||x.includes('..')))throw Error();
 const brandAssets=new Map([['/growthcast-wordmark.png','growthcast-wordmark.png','image/png'],['/api/branding/logo/team/3','growthcast-wordmark.png','image/png'],['/growthcast-manrope.ttf','assets/fonts/manrope-400.ttf','font/ttf'],['/growthcast-manrope-bold.ttf','assets/fonts/manrope-700.ttf','font/ttf'],['/growthcast-mono.ttf','assets/fonts/dm-mono-400.ttf','font/ttf']].map(([route,file,contentType])=>[route,{contentType,bytes:readFileSync('/app/deployment/web-app/brand/'+file)}]));
 const favicon={contentType:'image/jpeg',bytes:readFileSync('/app/deployment/web-app/brand/growthcast-favicon-v2.jpg')};
 for(const route of ['/growthcast-favicon-v2.jpg','/favicon.ico','/favicon-32x32.png','/favicon-16x16.png','/apple-touch-icon.png'])brandAssets.set(route,favicon);
 brandAssets.set('/site.webmanifest',{contentType:'application/manifest+json',bytes:Buffer.from(JSON.stringify({name:'GrowthCast',short_name:'GrowthCast',icons:[{src:'/growthcast-favicon-v2.jpg',sizes:'500x500',type:'image/jpeg'}],theme_color:'#242426',background_color:'#f4f1e9',display:'standalone'}))});
 const handler=createHandler({brandAssets,store:gateway.store,pinAccess:gateway.pinAccess,origin:'https://api.clients.staging.growthcast.app',upstream:'http://documenso.signing.staging.growthcast.internal:3000',embedParent:'https://clients.staging.growthcast.app',assets:new Set(assets)});
 const server=http.createServer((req,res)=>{if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ready":true}');return;}void handler(req,res);});
 // The provider preloads hundreds of modules over ALB HTTP/1 target connections.
 // Keep target sockets alive longer than the ALB 60-second idle timeout.
 server.headersTimeout=70000;server.requestTimeout=90000;server.keepAliveTimeout=65000;server.maxConnections=512;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3003,'0.0.0.0',resolve);});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>{void store.pool.end();});server.closeIdleConnections();setTimeout(()=>process.exit(1),10000).unref();});
 console.log('Staging recipient gateway ready');
}catch{await store?.pool.end().catch(()=>{});console.error('Recipient gateway startup refused; private details suppressed');process.exitCode=1;}
