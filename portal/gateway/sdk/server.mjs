import https from 'node:https';
import { readFileSync } from 'node:fs';
const origin='https://signing.growthcast.test:8443';
const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>GrowthCast signing compatibility test</title><link rel="stylesheet" href="/style.css"></head><body><main id="root"></main><script src="/sdk.js"></script></body></html>';
const script=readFileSync(new URL('./public/sdk.js',import.meta.url));
https.createServer({key:readFileSync('/runtime/tls.key'),cert:readFileSync('/runtime/tls.crt')},(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'self'; frame-src ${origin}; base-uri 'none'; frame-ancestors 'none'`);
  if(req.method!=='GET' || !['portal.growthcast.test:9443','untrusted.growthcast.test:9443'].includes(req.headers.host)){res.writeHead(404);return res.end();}
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);}
  if(req.url==='/sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(script);}
  if(req.url==='/style.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end('body{margin:0;font:16px system-ui;color:#18251d;background:#f5f7f5}h1,p{margin:1rem}h1{font-size:1.5rem}iframe{width:100%;height:calc(100dvh - 110px);border:0;background:white}');}
  res.writeHead(404);res.end();
}).listen(9443,'0.0.0.0');
