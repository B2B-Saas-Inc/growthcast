import https from 'node:https';
import http from 'node:http';
import {readFileSync} from 'node:fs';
https.createServer({key:readFileSync('/tls/web.key'),cert:readFileSync('/tls/web.crt')},(req,res)=>{
 const api=req.headers.host==='api.portal.growthcast.invalid';
 const target=http.request({host:api?'provider':'web',port:api?3001:3000,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https','x-forwarded-host':req.headers.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 target.on('error',()=>{res.writeHead(502);res.end();});req.pipe(target);
}).listen(443,'0.0.0.0');
