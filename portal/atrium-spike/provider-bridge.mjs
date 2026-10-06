// Disposable internal network bridge: no host ports and no production upstream.
import http from 'node:http';
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)||!req.url.startsWith('/')||req.url.startsWith('//')) {res.writeHead(404);return res.end();}
  const upstream=http.request({hostname:'documenso',port:3000,path:req.url,method:req.method,headers:{...req.headers,host:'documenso:3000'},timeout:15000},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});
  req.on('aborted',()=>upstream.destroy());
  upstream.end();
}).listen(3000,'0.0.0.0');
