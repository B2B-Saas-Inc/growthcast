import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync,copyFileSync,chownSync,chmodSync,readFileSync,mkdirSync} from 'node:fs';
const password = () => randomBytes(32).toString('hex');
const host = 'db.abcdefghijklmnopqrst.supabase.co';
execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
  '-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host,
  '-keyout','/tls/server.key','-out','/tls/server.crt'], {stdio:'ignore'});
chownSync('/tls/server.key',0,70); chmodSync('/tls/server.key',0o640);
copyFileSync('/tls/server.crt','/runtime/database-ca.crt');
writeFileSync('/tls/pg_hba.conf','local all all trust\nhostssl all all all scram-sha-256\n');
writeFileSync('/admin/password',password());
writeFileSync('/runtime/database-url',`postgresql://gc_documenso:${password()}@${host}:5432/postgres`);
const applicationEnv = {
  NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOSTNAME:'0.0.0.0',PORT:'3000',
  NEXTAUTH_SECRET:password(),NEXT_PRIVATE_ENCRYPTION_KEY:password(),NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY:password(),
  NEXT_PUBLIC_WEBAPP_URL:'https://sign.growthcast.invalid',NEXT_PRIVATE_INTERNAL_WEBAPP_URL:'http://provider:3000',
  NEXT_PUBLIC_UPLOAD_TRANSPORT:'database',NEXT_PRIVATE_JOBS_PROVIDER:'local',NEXT_PUBLIC_DISABLE_SIGNUP:'true',
  NEXT_PRIVATE_SMTP_TRANSPORT:'smtp-auth',NEXT_PRIVATE_SMTP_HOST:'mail',NEXT_PRIVATE_SMTP_PORT:'1025',
  NEXT_PRIVATE_SMTP_SECURE:'false',NEXT_PRIVATE_SMTP_FROM_NAME:'Synthetic test',NEXT_PRIVATE_SMTP_FROM_ADDRESS:'test@growthcast.invalid',
  NEXT_PUBLIC_POSTHOG_KEY:'',NEXT_TELEMETRY_DISABLED:'1',DOCUMENSO_DISABLE_TELEMETRY:'true',
};
if (process.argv[2] === 'signing') Object.assign(applicationEnv, {
  PORTAL_MANAGED_RUNTIME_TEST:'1',
  NEXT_PUBLIC_WEBAPP_URL:'https://signing.growthcast.test:8443',
  NEXT_PRIVATE_INTERNAL_WEBAPP_URL:'http://documenso:3000',
  NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:'/runtime/test-cert.p12',
  NEXT_PRIVATE_SIGNING_PASSPHRASE:'',
});
if (process.argv[2] === 'atrium') {
  writeFileSync('/origin/api-origin',password());
  chownSync('/storage',1000,1000);
  writeFileSync('/runtime/database-url',`postgresql://gc_app:${password()}@${host}:5432/postgres`);
  for (const key of Object.keys(applicationEnv)) delete applicationEnv[key];
  Object.assign(applicationEnv, {
    NODE_ENV:'production',PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',PORT:'3001',
    BETTER_AUTH_SECRET:password(),WEB_URL:'https://portal.growthcast.invalid',
    API_URL:'https://api.growthcast.invalid',SECURE_COOKIES:'true',ALLOW_SIGNUPS:'false',
    BILLING_ENABLED:'false',STORAGE_PROVIDER:'local',UPLOAD_DIR:'/data/uploads',
    SENTRY_ENABLED:'false',LOG_LEVEL:'silent',
    PORTAL_MAIL_MODE:'capture',
  });
}
if (process.env.RUNTIME_MANAGED_STORAGE === '1') {
  if (process.argv[2] !== 'atrium') throw Error('Atrium storage fixture required');
  const credentials = JSON.parse(readFileSync('/input/storage-credentials.json','utf8'));
  if (credentials.projectRef !== 'saedetvoolpdysiyjwvg' || credentials.bucket !== 'gc-atrium-private') throw Error('Staging storage credential required');
  copyFileSync('/input/storage-credentials.json','/managed-storage/credentials.json');
  chownSync('/managed-storage/credentials.json',1000,1000);
  chmodSync('/managed-storage/credentials.json',0o400);
  Object.assign(applicationEnv,{STORAGE_PROVIDER:'supabase',PORTAL_STORAGE_PROJECT_REF:credentials.projectRef,PORTAL_STORAGE_BUCKET:credentials.bucket});
}
if (process.env.GC_SECRET_MODE === 'materialized') {
  const atrium = process.argv[2] === 'atrium';
  const uid = atrium ? 1000 : 1001;
  const directory = '/runtime/material';
  mkdirSync(directory,{mode:0o700});
  chownSync(directory,uid,uid);
  const secrets = {};
  for (const key of atrium ? ['BETTER_AUTH_SECRET'] : ['NEXTAUTH_SECRET','NEXT_PRIVATE_ENCRYPTION_KEY','NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY']) {
    secrets[key] = applicationEnv[key]; delete applicationEnv[key];
  }
  const path = directory + '/application-secret-env.json';
  writeFileSync(path,JSON.stringify(secrets),{mode:0o400,flag:'wx'}); chownSync(path,uid,uid);
  if (atrium) {
    const originPath = directory + '/api-origin';
    writeFileSync(originPath,readFileSync('/origin/api-origin'),{mode:0o400,flag:'wx'}); chownSync(originPath,uid,uid);
  }
}
writeFileSync('/runtime/application-env.json',JSON.stringify(applicationEnv));
console.log('Disposable credentials and TLS generated.');
