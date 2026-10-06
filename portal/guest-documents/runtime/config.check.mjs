import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdirSync,mkdtempSync,writeFileSync,chmodSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {readConfiguration,readSharedConfiguration,readDeliveryConfiguration} from './config.mjs';
const prepare=()=>{
 const dir=mkdtempSync('/tmp/guest-runtime-');chmodSync(dir,0o700);
 const values={'config.json':JSON.stringify({projectRef:'saedetvoolpdysiyjwvg',portalOrigin:'https://clients.staging.growthcast.app',apiOrigin:'https://api.example.test',bucket:'gc-atrium-private'}),'origin-proof':'a'.repeat(64),'database-url':'postgresql://gc_app:synthetic@db.saedetvoolpdysiyjwvg.supabase.co/postgres','database-ca.crt':'synthetic-ca','storage.json':JSON.stringify({password:'synthetic'})};
 for(const [name,value] of Object.entries(values))writeFileSync(dir+'/'+name,value,{mode:0o400});return dir;
};
test('delivery requires private exact credentials and the existing delivered auth secret',()=>{
 const d=mkdtempSync('/tmp/guest-delivery-');chmodSync(d,0o700);
 const value={organizationId:'workspace',teamId:3,providerToken:'api_'+'a'.repeat(48),encryptionKey:'b'.repeat(64)};
 const put=(name,data)=>{const path=d+'/'+name;try{chmodSync(path,0o600);}catch{}writeFileSync(path,JSON.stringify(data),{mode:0o400});chmodSync(path,0o400);};
 try{
  put('delivery.json',value);put('auth.json',{BETTER_AUTH_SECRET:'c'.repeat(64)});
  const config=readDeliveryConfiguration(d,d+'/auth.json');assert.equal(config.encryptionKey.length,32);assert.equal(config.authSecret,'c'.repeat(64));
  for(const changes of [{providerToken:'invalid'},{encryptionKey:'short'},{teamId:0},{organizationId:''},{smtpHost:'override'}]){put('delivery.json',{...value,...changes});assert.throws(()=>readDeliveryConfiguration(d,d+'/auth.json'));}
  put('delivery.json',value);chmodSync(d+'/delivery.json',0o644);assert.throws(()=>readDeliveryConfiguration(d,d+'/auth.json'));
  chmodSync(d+'/delivery.json',0o400);put('auth.json',{BETTER_AUTH_SECRET:'short'});assert.throws(()=>readDeliveryConfiguration(d,d+'/auth.json'));
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('explicit staging files retain verified TLS and restricted application role',()=>{const d=prepare();try{const config=readConfiguration(d);assert.equal(config.database.config.user,'gc_app');assert.equal(config.database.config.ssl.rejectUnauthorized,true);assert.equal('scannerConfiguration' in config.application,false);assert.equal(config.application.portalOrigin,'https://clients.staging.growthcast.app');}finally{rmSync(d,{recursive:true});}});
test('public files, symlinks, malformed proofs and administrator database credentials are refused',()=>{
 const replace=(d,name,value)=>{chmodSync(d+'/'+name,0o600);writeFileSync(d+'/'+name,value);chmodSync(d+'/'+name,0o400);};
 const changes=[d=>chmodSync(d,0o755),d=>chmodSync(d+'/origin-proof',0o644),d=>{writeFileSync(d+'/proof-copy','a'.repeat(64),{mode:0o400});rmSync(d+'/origin-proof');symlinkSync(d+'/proof-copy',d+'/origin-proof');},d=>replace(d,'origin-proof','invalid'),d=>replace(d,'database-url','postgresql://postgres:synthetic@db.saedetvoolpdysiyjwvg.supabase.co/postgres'),d=>{const c=JSON.parse(readFileSync(d+'/config.json'));c.portalOrigin='https://clients.growthcast.app';replace(d,'config.json',JSON.stringify(c));}];
 for(const change of changes){const d=prepare();try{change(d);assert.throws(()=>readConfiguration(d));}finally{rmSync(d,{recursive:true,force:true});}}
});

test('existing API-delivered connection storage and origin files supply staff runtime without new credentials',()=>{
 const d=prepare(),pairs=[['database-url','/run/connections/material/database-url'],['database-ca.crt','/run/connections/material/database-ca.crt'],['origin-proof','/run/origin/api-origin'],['storage.json','/run/storage/credentials.json']];
 try{for(const [source,target]of pairs){mkdirSync(target.slice(0,target.lastIndexOf('/')),{recursive:true,mode:0o700});writeFileSync(target,readFileSync(d+'/'+source),{mode:0o400,flag:'wx'});}
  const value=readSharedConfiguration();assert.equal(value.database.config.user,'gc_app');assert.equal(value.application.originProof,'a'.repeat(64));assert.equal(value.application.apiOrigin,'https://api.clients.staging.growthcast.app');assert.deepEqual(value.application.storageConfiguration.credentials,{password:'synthetic'});
  chmodSync('/run/origin/api-origin',0o644);assert.throws(()=>readSharedConfiguration());
 }finally{rmSync(d,{recursive:true,force:true});for(const dir of ['/run/connections','/run/origin','/run/storage'])rmSync(dir,{recursive:true,force:true});}
});
