import {createRequire} from 'node:module';
import http from 'node:http';
const require=createRequire('/app/apps/web/package.json');
const next=require('next');
// Match Vercel's canonical HTTPS request origin while listening behind fixture TLS.
const app=next({dev:false,hostname:'portal.growthcast.invalid',port:443});
await app.prepare();
http.createServer(app.getRequestHandler()).listen(3000,'0.0.0.0');
