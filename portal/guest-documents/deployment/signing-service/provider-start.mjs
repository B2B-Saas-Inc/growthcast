import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
const require=createRequire('/boundary/package.json');
const {SecretsManagerClient,GetSecretValueCommand}=require('@aws-sdk/client-secrets-manager');
const {fromContainerMetadata}=require('@aws-sdk/credential-providers');
let child;
const certificate='/run/config/signing.p12',envFile='/run/config/application-env.json';
const cleanup=()=>{for(const p of [certificate,envFile])if(existsSync(p))unlinkSync(p);};
try{
 if(process.getuid()!==1001||process.env.GC_SERVICE!=='documenso'||process.env.SUPABASE_PROJECT_REF!=='saedetvoolpdysiyjwvg')throw Error();
 const pin=JSON.parse(readFileSync('/boundary/signing-certificate-pin.json','utf8'));
 const client=new SecretsManagerClient({region:'us-east-1',credentials:fromContainerMetadata(),maxAttempts:3});
 let value;try{const result=await client.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));if(result.VersionId!==pin.version)throw Error();value=JSON.parse(result.SecretString);}finally{client.destroy();}
 if(value.purpose!=='staging-document-signing-only'||typeof value.p12!=='string'||typeof value.passphrase!=='string')throw Error();
 writeFileSync(certificate,Buffer.from(value.p12,'base64'),{flag:'wx',mode:0o400});
 const env={NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOSTNAME:'0.0.0.0',PORT:'3000',
  NEXT_PUBLIC_WEBAPP_URL:'https://api.clients.staging.growthcast.app',NEXT_PRIVATE_INTERNAL_WEBAPP_URL:'http://127.0.0.1:3000',
  NEXT_PUBLIC_UPLOAD_TRANSPORT:'database',NEXT_PRIVATE_JOBS_PROVIDER:'local',NEXT_PUBLIC_DISABLE_SIGNUP:'true',
  // Portal delivery uses the approved Workspace mailer; native distribution is NONE.
  NEXT_PRIVATE_SMTP_TRANSPORT:'smtp-auth',NEXT_PRIVATE_SMTP_HOST:'127.0.0.1',NEXT_PRIVATE_SMTP_PORT:'1025',NEXT_PRIVATE_SMTP_SECURE:'false',NEXT_PRIVATE_SMTP_FROM_NAME:'GrowthCast',NEXT_PRIVATE_SMTP_FROM_ADDRESS:'clients@growthcast.app',
  NEXT_PUBLIC_POSTHOG_KEY:'',NEXT_TELEMETRY_DISABLED:'1',DOCUMENSO_DISABLE_TELEMETRY:'true',NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:certificate,NEXT_PRIVATE_SIGNING_PASSPHRASE:value.passphrase};
 writeFileSync(envFile,JSON.stringify(env),{flag:'wx',mode:0o400});value=undefined;
 child=spawn('/usr/local/bin/node',['/boundary/deployment/runtime/start.mjs','/usr/local/bin/node','/app/apps/remix/build/server/main.js'],{env:{...process.env,GC_SECRET_MODE:'secretsmanager',GC_CONNECTION_MODE:'secretsmanager'},stdio:'ignore'});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
 child.once('error',()=>{cleanup();console.error('Private signing provider failed to start');process.exitCode=1;});
 child.once('exit',(code,signal)=>{cleanup();process.exitCode=code??(signal==='SIGTERM'?0:1);});
 console.log('Private signing provider starting with pinned managed configuration');
}catch{cleanup();console.error('Private signing provider configuration refused');process.exitCode=1;}
