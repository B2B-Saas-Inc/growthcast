import https from 'node:https';
import http from 'node:http';
import {readFileSync} from 'node:fs';
https.createServer({key:readFileSync('/runtime/tls.key'),cert:readFileSync('/runtime/tls.crt')},(req,res)=>{
  if(req.headers.host!=='portal.growthcast.test:8444'){res.writeHead(404);return res.end();}
  const api=req.url.startsWith('/api/');
  const upstream=http.request({hostname:api?'api':'web',port:api?3001:3000,path:req.url,method:req.method,
    headers:{...req.headers,'x-forwarded-proto':'https'}},reply=>{
    res.writeHead(reply.statusCode,{...reply.headers,'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'});
    reply.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(502);res.end('Unavailable');});req.pipe(upstream);
}).listen(8444,'0.0.0.0');
