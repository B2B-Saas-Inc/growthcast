import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,existsSync,lstatSync,chmodSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [mode,action]=process.argv.slice(2);
assert(['atrium','documenso'].includes(mode));
const paths=mode==='atrium'?['/application/application-env.json','/auxiliary/api-origin']:['/application/application-env.json','/auxiliary/test-cert.p12','/auxiliary/tls.key'];
const hash=b=>createHash('sha256').update(b).digest('hex');
function validateFixture(){
 const db=new URL(readFileSync('/application/database-url','utf8'));
 assert.equal(db.hostname,'db.abcdefghijklmnopqrst.supabase.co');
 assert.equal(db.username,mode==='atrium'?'gc_app':'gc_documenso');
 const env=JSON.parse(readFileSync(paths[0],'utf8'));
 assert.equal(env.NODE_ENV,'production');
 if(mode==='atrium'){assert.equal(env.PORTAL_MAIL_MODE,'capture');assert.equal(env.WEB_URL,'https://portal.growthcast.invalid');assert.match(env.BETTER_AUTH_SECRET,/^[a-f0-9]{64}$/);}
 else {assert.equal(env.PORTAL_MANAGED_RUNTIME_TEST,'1');assert.equal(env.NEXT_PUBLIC_WEBAPP_URL,'https://signing.growthcast.test:8443');assert.match(env.NEXT_PRIVATE_ENCRYPTION_KEY,/^[a-f0-9]{64}$/);}
}
function decode(){
 const raw=execFileSync('tar',['-xOf','/restored/bundle.tar','secrets.json'],{maxBuffer:1024*1024});
 const bundle=JSON.parse(raw);assert.equal(bundle.schemaVersion,1);assert.equal(bundle.scope,'disposable-runtime-secrets');assert.equal(bundle.service,mode);
 assert.deepEqual(bundle.files.map(f=>f.path),paths);
 return bundle.files.map(f=>{const bytes=Buffer.from(f.base64,'base64');assert.equal(bytes.toString('base64'),f.base64);assert(bytes.length>0&&bytes.length<65536);assert.equal(hash(bytes),f.sha256);return {...f,bytes};});
}
function restore(files){
 // Validate every entry and every destination before creating any file.
 for(const file of files)assert(!existsSync(file.path),'Occupied secret target');
 for(const file of files){writeFileSync(file.path,file.bytes,{flag:'wx',mode:0o644});chmodSync(file.path,0o644);}
}
if(action==='capture'){
 validateFixture();
 const files=paths.map(path=>{assert(lstatSync(path).isFile());const bytes=readFileSync(path);assert(bytes.length>0&&bytes.length<65536);return {path,base64:bytes.toString('base64'),sha256:hash(bytes)};});
 writeFileSync('/snapshot/secrets.json',JSON.stringify({schemaVersion:1,scope:'disposable-runtime-secrets',service:mode,files}),{flag:'wx',mode:0o600});
 execFileSync('tar',['-cf','/snapshot/bundle.tar','-C','/snapshot','secrets.json']);
 console.log(JSON.stringify({files:files.length,service:mode}));
}else if(action==='erase'){
 validateFixture();for(const path of paths)unlinkSync(path);
 for(const path of ['/snapshot/secrets.json','/snapshot/bundle.tar','/key/key','/encrypted/backup.gcb'])unlinkSync(path);
 assert(paths.every(p=>!existsSync(p)));
 console.log('Original application secrets, plaintext snapshot, archive and data key removed.');
}else if(action==='restore'){
 const files=decode();assert(paths.every(p=>!existsSync(p)));
 writeFileSync(paths[0],'occupied-sentinel',{flag:'wx',mode:0o600});
 assert.throws(()=>restore(files),/Occupied secret target/);assert.equal(readFileSync(paths[0],'utf8'),'occupied-sentinel');assert(paths.slice(1).every(p=>!existsSync(p)));unlinkSync(paths[0]);
 restore(files);validateFixture();
 for(const f of files){assert.equal(hash(readFileSync(f.path)),f.sha256);assert.equal(lstatSync(f.path).mode&0o777,0o644);}
 console.log(JSON.stringify({service:mode,restoredFiles:files.length,byteExact:true,occupiedTargetDenied:true,partialRestoreDenied:true}));
}else throw Error('Explicit bundle operation required');
