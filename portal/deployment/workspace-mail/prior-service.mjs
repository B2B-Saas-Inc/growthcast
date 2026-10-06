import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const env={NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',PORT:'3001',WEB_URL:'https://clients.staging.growthcast.app',API_URL:'https://clients.staging.growthcast.app',SECURE_COOKIES:'true',ALLOW_SIGNUPS:'false',BILLING_ENABLED:'false',STORAGE_PROVIDER:'supabase',PORTAL_STORAGE_PROJECT_REF:'saedetvoolpdysiyjwvg',PORTAL_STORAGE_BUCKET:'gc-atrium-private',SENTRY_ENABLED:'false',LOG_LEVEL:'silent',PORTAL_MAIL_MODE:'capture',PORTAL_MAIL_CAPTURE_HOST:'127.0.0.1'};
writeFileSync('/run/config/application-env.json',JSON.stringify(env),{flag:'wx',mode:0o400});
const child=spawn('/usr/local/bin/bun',['/boundary/deployment/runtime/start.mjs','/usr/local/bin/bun','/upstream/apps/api/dist/main.js'],{env:{...process.env,GC_SERVICE:'atrium',GC_SECRET_MODE:'secretsmanager',SUPABASE_PROJECT_REF:'saedetvoolpdysiyjwvg'},stdio:'ignore'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Staging API launch failed');process.exitCode=1;});
child.on('exit',(code)=>{console.log(JSON.stringify({event:'application-exit',code}));process.exitCode=code??1;});
