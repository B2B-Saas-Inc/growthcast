import {publicEncrypt,constants} from 'node:crypto';
const origin=process.env.CAPTURE_ORIGIN,email=process.env.FIXTURE_EMAIL;
try {
 if(!/^http:\/\/10\.89\.\d+\.\d+:1080$/.test(origin)||!/^browser-[a-f0-9]{16}-invited@growthcast.invalid$/.test(email))throw Error();
 const messages=await (await fetch(origin+'/email',{signal:AbortSignal.timeout(10000)})).json();
 const selected=messages.filter(m=>m.to?.length===1&&m.to[0].address===email);
 if(selected.length<2||selected.length>5)throw Error();
 const results=[];
 for(const m of selected){const body=await (await fetch(origin+'/email/'+encodeURIComponent(m.id))).json();const links=[...body.html.matchAll(/https?:[^"\s<>]+/g)].map(x=>x[0].replaceAll('&amp;','&')).filter(x=>x.includes('/accept-invite?')||x.includes('/verify-email?'));results.push({id:m.id,recipient:email,links});}
 const plain=Buffer.from(JSON.stringify(results)),blocks=[];
 for(let i=0;i<plain.length;i+=256)blocks.push(publicEncrypt({key:process.env.COLLECTOR_PUBLIC_KEY,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},plain.subarray(i,i+256)).toString('base64'));
 console.log(JSON.stringify({encryptedCapture:blocks}));
 for(const m of selected){const r=await fetch(origin+'/email/'+encodeURIComponent(m.id),{method:'DELETE'});if(!r.ok)throw Error();}
 console.log(JSON.stringify({captureCount:results.length,fixtureMessagesDeleted:true}));
}catch{console.error('Bounded mail capture failed; no message contents logged');process.exitCode=1;}
