import http from 'node:http';
import {createRuntime} from './runtime.mjs';
import {createHttpHandler} from './http.mjs';
let runtime;
const handler=createHttpHandler({getRuntime:()=>runtime??=(createRuntime().catch(error=>{runtime=undefined;throw error;}))});
const server=http.createServer((req,res)=>{
 if(req.url!=='/stripe/test'){res.writeHead(404).end();return;}
 return handler(req,res);
});
server.headersTimeout=10000;
server.requestTimeout=60000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
