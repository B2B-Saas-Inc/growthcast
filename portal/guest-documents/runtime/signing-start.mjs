import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {signingSecrets} from './signing-secrets.mjs';
let material;
try{
 const kind=process.env.GC_SIGNING_SERVICE;
 const entry={delivery:'start.mjs',gateway:'gateway-start.mjs',lifecycle:'lifecycle-start.mjs'}[kind];
 if(!entry)throw Error();
 const pins=JSON.parse(readFileSync('/app/signing-pins.json','utf8'));
 material=await signingSecrets({kind,pins});
 const env={...process.env,...(kind==='delivery'?{GC_DOCUMENT_DELIVERY:'staging-verified'}:{})};
 const child=spawn(process.execPath,['/app/guest-documents/runtime/'+entry],{env,stdio:'inherit'});
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
 child.once('error',()=>{material.cleanup();process.exitCode=1;});
 child.once('exit',(code,signal)=>{material.cleanup();process.exitCode=code??(signal==='SIGTERM'?0:1);});
}catch{material?.cleanup();console.error('Signing service startup refused; private details suppressed');process.exitCode=1;}
