import {pdfPlaceholders} from './signing/placeholders.mjs';
import {maxPdfBytes} from './ingestion.mjs';
import {hash} from './workflow.mjs';
const cookie='__Host-gc-guest';
const common={'Strict-Transport-Security':'max-age=31536000','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const script=`let share=location.hash.slice(1),csrf='';history.replaceState(null,'','/guest');const status=document.querySelector('#status');const form=document.querySelector('form');async function show(){const r=await fetch('/api/guest/document');if(!r.ok)return;const d=await r.json();form.hidden=true;document.querySelector('h1').textContent=d.title;document.querySelector('#download').hidden=false;status.textContent='Your document is ready.';}form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{const r=await fetch('/api/guest/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({share,pin:document.querySelector('#pin').value})});if(!r.ok)throw Error();csrf=(await r.json()).csrf;share='';document.querySelector('#pin').value='';await show();}catch{status.textContent='Access unavailable. Check your link and PIN, or try again later.';}finally{b.disabled=false;}});if(!share)show();`;
const html='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>GrowthCast secure document</title><link rel="stylesheet" href="/guest.css"></head><body><main><img src="/guest-logo.png" alt="GrowthCast" width="220"><h1>Open your document</h1><p>Enter the eight-digit PIN provided separately.</p><form><label for="pin">Access PIN</label><input id="pin" type="password" inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" required autocomplete="off"><button>Open document</button></form><p id="status" role="status"></p><a id="download" href="/api/guest/artifact" hidden>Download document</a></main><script src="/guest.js"></script></body></html>';
async function body(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>32768)throw Error('Bounded body');chunks.push(c);}return JSON.parse(Buffer.concat(chunks));}
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join()===keys;
export function guestHandler({store,origin,authenticateStaff,readArtifact,logo,staffWorkflow,ingestion,delivery}){
 if(!store||typeof authenticateStaff!=='function'||typeof readArtifact!=='function'||!Buffer.isBuffer(logo)||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('Required guest configuration missing');
 return async(req,res)=>{
  for(const [k,v] of Object.entries(common))res.setHeader(k,v);
  const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:(type==='application/json'?JSON.stringify(value):value));};
  const deny=(status=404)=>send(status,{error:'Document access unavailable'});
  try{
   if(req.headers.host!==new URL(origin).host||req.headers.authorization||req.headers.upgrade)return deny();
   const path=req.url;
   const isUpload=path==='/api/guest/staff/upload';
   if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!==(isUpload?'application/pdf':'application/json')))return deny(403);
   if(req.method==='GET'&&path==='/guest')return send(200,html,'text/html; charset=utf-8');
   if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return deny(403);
   if(req.method==='GET'&&path==='/guest.js')return send(200,script,'text/javascript');
   if(req.method==='GET'&&path==='/guest-logo.png')return send(200,logo,'image/png');
   if(req.method==='GET'&&path==='/guest.css')return send(200,'body{margin:0;background:#f8f8f5;color:#1d2524;font:17px Manrope,Arial,sans-serif}main{max-width:30rem;margin:10vh auto;padding:24px}form{display:grid;gap:16px}input,button{font:inherit;padding:14px;border:1px solid #aaa;border-radius:8px}button{background:#dfff00;color:#171c1b;cursor:pointer}a{color:#174b3c}img{max-width:100%;height:auto}h1{font-size:32px}#status{min-height:2em}:focus-visible{outline:3px solid #3579a5;outline-offset:3px}','text/css');
   if(path.startsWith('/api/guest/staff/')){
    const actor=await authenticateStaff(req);if(!actor?.userId||!actor?.organizationId||actor.csrfValid!==true)return deny(403);
    const who=[actor.userId,actor.organizationId];
    if(req.method==='GET'&&staffWorkflow&&path.startsWith('/api/guest/staff/record?')){
     const params=new URL(path,origin).searchParams;if(path.length>250||[...params.keys()].sort().join()!=='entity,id')return deny();
     return send(200,await staffWorkflow.record(...who,params.get('entity'),params.get('id')));
    }
    if(req.method==='GET'&&path==='/api/guest/staff/capabilities')return send(200,{sending:!!delivery});
    if(req.method==='GET'&&delivery&&path.startsWith('/api/guest/staff/send-status?')){
     const params=new URL(path,origin).searchParams;
     if(path.length>200||[...params.keys()].join()!=='approvalId')return deny();
     return send(200,await delivery.statusForApproval(...who,params.get('approvalId')));
    }
    if(req.method==='GET'&&staffWorkflow&&(path.startsWith('/api/guest/staff/artifact?')||path.startsWith('/api/guest/staff/placeholders?'))){
     const params=new URL(path,origin).searchParams;if(path.length>200||[...params.keys()].join()!=='versionId')return deny();
     const version=params.get('versionId'),binding=await staffWorkflow.artifact(...who,version);
     const bytes=await readArtifact({organizationId:actor.organizationId,projectId:binding.project_id,documentId:binding.document_id,key:binding.artifact_key,sha256:binding.artifact_sha256});
     if(!Buffer.isBuffer(bytes)||bytes.length>maxPdfBytes||hash(bytes)!==binding.artifact_sha256)return deny();
     const current=await authenticateStaff(req);if(current?.userId!==actor.userId||current?.organizationId!==actor.organizationId||current.csrfValid!==true)return deny(403);await staffWorkflow.artifact(...who,version);
     if(path.startsWith('/api/guest/staff/placeholders?'))return send(200,await pdfPlaceholders(bytes));
     res.setHeader('Content-Disposition','attachment; filename="document.pdf"');return send(200,bytes,'application/pdf');
    }
    if(req.method==='GET'&&staffWorkflow&&path.startsWith('/api/guest/staff/fields?')){
     const params=new URL(path,origin).searchParams;
     if(path.length>250||[...params.keys()].sort().join()!=='recipientId,versionId')return deny();
     return send(200,await staffWorkflow.savedFields(...who,params.get('versionId'),params.get('recipientId')));
    }
    if(req.method==='POST'&&isUpload){
     if(!ingestion)return deny();
     const documentId=req.headers['x-growthcast-document-id'],encodedTitle=req.headers['x-growthcast-document-title'];
     if(typeof encodedTitle!=='string'||encodedTitle.length>2400||typeof documentId!=='string'||req.headers['content-encoding'])return deny();
     const declared=req.headers['content-length'];if(declared!==undefined&&(!/^[0-9]+$/.test(declared)||Number(declared)>maxPdfBytes))return deny(413);
     let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxPdfBytes)return deny(413);chunks.push(chunk);}
     return send(200,await ingestion.upload(...who,{documentId,title:decodeURIComponent(encodedTitle),contentType:'application/pdf',bytes:Buffer.concat(chunks)}));
    }
    if(req.method==='GET'&&staffWorkflow&&(path==='/api/guest/staff/catalog'||path.startsWith('/api/guest/staff/catalog?'))){
     if(path.length>1024)return deny();
     const params=new URL(path,origin).searchParams,options={};
     for(const key of params.keys())if(!['collection','limit','after'].includes(key)||params.getAll(key).length!==1)return deny();
     if(params.has('collection'))options.collection=params.get('collection');
     if(params.has('after'))options.after=params.get('after');
     if(params.has('limit')){const value=params.get('limit');if(!/^[1-9][0-9]{0,2}$/.test(value))return deny();options.limit=Number(value);}
     return send(200,await staffWorkflow.catalog(...who,options));
    }
    if(req.method!=='POST')return deny();
    const b=await body(req),route=path.slice('/api/guest/staff/'.length);
    if(route==='send'){
     if(!delivery||!exact(b,'approvalId'))return deny();
     return send(202,await delivery.request(...who,b.approvalId));
    }
    if(route==='pin'){if(!exact(b,'dispatchId'))return deny();return send(200,await store.issue(...who,b.dispatchId));}
    if(!staffWorkflow)return deny();
    const routes={
     edit:['entity,id,value',()=>staffWorkflow.editRecord(...who,b)],
     delete:['entity,id',()=>staffWorkflow.deleteRecord(...who,b)],
     clients:['name',()=>staffWorkflow.createClient(...who,b.name)],
     recipients:['clientId,email',()=>staffWorkflow.createRecipient(...who,b.clientId,b.email)],
     documents:['clientId,kind,projectId',()=>staffWorkflow.createDocument(...who,b.clientId,b.projectId,b.kind)],
     versions:['artifactKey,artifactSha256,documentId,title',()=>staffWorkflow.createVersion(...who,b.documentId,b)],
     preview:[[...(b.fields===undefined?[]:['fields']),'recipientId',...(b.requirePin===undefined?[]:['requirePin']),'versionId'].join(','),()=>staffWorkflow.preview(...who,b.versionId,b.recipientId,b.fields,b.requirePin)],
     approve:[['expiresAt',...(b.fields===undefined?[]:['fields']),'previewSha256','recipient',...(b.requirePin===undefined?[]:['requirePin']),'version'].join(','),()=>staffWorkflow.approve(...who,b)],
     dispatch:['approvalId',()=>staffWorkflow.prepareDispatch(...who,b.approvalId)],
     revoke:['dispatchId',()=>staffWorkflow.revoke(...who,b.dispatchId)]
    };
    const selected=Object.hasOwn(routes,route)?routes[route]:null;if(!selected||!exact(b,selected[0]))return deny();
    return send(200,await selected[1]());
   }
   if(req.method==='POST'&&path==='/api/guest/unlock'){
    const b=await body(req);if(!exact(b,'pin,share'))return deny();const session=await store.unlock(b.share,b.pin,req.socket.remoteAddress);if(!session)return deny();
    res.setHeader('Set-Cookie',`${cookie}=${session.session}; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Strict`);return send(200,{csrf:session.csrf});
   }
   const cookies=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookie+'='));
   const token=cookies.length===1?cookies[0].slice(cookie.length+1):'';
   const authorized=await store.authorize(token);if(!authorized)return deny();
   if(req.method==='GET'&&path==='/api/guest/document')return send(200,{title:authorized.title,versionId:authorized.version_id});
   if(req.method==='POST'&&path==='/api/guest/logout'){
    if(!await store.logout(token,req.headers['x-growthcast-csrf']))return deny(403);
    res.setHeader('Set-Cookie',`${cookie}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);return send(200,{loggedOut:true});
   }
   if(['GET','HEAD'].includes(req.method)&&path==='/api/guest/artifact'){
    if(req.headers.range)return deny(416);
    const bytes=await readArtifact({organizationId:authorized.organization_id,projectId:authorized.project_id,key:authorized.artifact_key,sha256:authorized.artifact_sha256});
    if(!Buffer.isBuffer(bytes)||bytes.length>3*1024*1024||hash(bytes)!==authorized.artifact_sha256)return deny();
    // A slow storage read must not outlive revocation, expiry or PIN rotation.
    if(!await store.authorize(token))return deny();
    res.setHeader('Content-Disposition','attachment; filename="document.pdf"');res.setHeader('Content-Length',bytes.length);return send(200,bytes,'application/pdf');
   }
   return deny();
  }catch{return deny();}
 };
}
