import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const pool=new pg.Pool({connectionString:readFileSync('/runtime/database-url','utf8'),ssl:{ca:readFileSync('/runtime/database-ca.crt','utf8'),rejectUnauthorized:true}});
const state=JSON.parse(readFileSync('/auth/session.json')),cookies=new Map(state.cookies),proof=readFileSync('/origin/api-origin','utf8').trim();
cookies.set('csrf-token',randomBytes(32).toString('hex'));
const checks=[];
async function api(path,method='GET',body,anonymous=false){
 const headers={'origin':'https://portal.growthcast.invalid','x-growthcast-origin':proof};if(!anonymous){headers.cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');headers['x-csrf-token']=cookies.get('csrf-token');}
 if(body && !(body instanceof FormData))headers['content-type']='application/json';
 return fetch('http://provider:3001/api'+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
}
const form=(filename,text='Synthetic SOP',extra={})=>{const f=new FormData();f.append('file',new Blob([text],{type:filename.endsWith('.pdf')?'application/pdf':'application/octet-stream'}),filename);for(const [k,v]of Object.entries(extra))f.append(k,v);return f;};
async function ok(path,method='GET',body){const r=await api(path,method,body);assert(r.ok,`${method} ${path}: ${r.status} ${await r.clone().text()}`);return r.json();}
const role=async r=>{await pool.query('UPDATE gc_atrium.member SET role=$1 WHERE "userId"=$2 AND "organizationId"=$3',[r,state.identity,'runtime-org']);await api('/auth/get-session');};
if(['member','admin'].includes(process.argv[2])){await role(process.argv[2]);await pool.end();console.log('Synthetic review role changed.');process.exit(0);}
try {
 assert.equal((await api('/library')).status,403);assert.equal((await api('/library','GET',undefined,true)).status,401);checks.push('clients and anonymous visitors cannot list the Library');
 await role('admin');
 await pool.query(`INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") VALUES('library-project','Library acceptance','runtime-org',now()),('library-other-project','Other project','runtime-other-org',now())`);
 await pool.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") VALUES($1,$2,$3)',['library-assignment','library-project',state.identity]);
 const beforeMail=(await (await fetch('http://mail:1080/email')).json()).length;
 const upload=await ok('/documents','POST',form('executed.pdf','%PDF-1.7\nSynthetic upload\n%%EOF',{projectId:'library-project',type:'contract',title:'Executed contract',reminderEnabled:'true'}));
 assert.equal(upload.status,'uploaded');assert.equal(upload.reminderEnabled,false);assert.equal(upload.sentAt,null);
 assert.equal((await api('/documents/'+upload.id+'/send','POST',{})).status,400);checks.push('executed contract stored as Uploaded without send or reminders');
 const version=await ok('/documents/'+upload.id+'/upload-version','POST',form('revised.pdf','%PDF-1.7\nRevised synthetic\n%%EOF'));assert.equal(version.status,'uploaded');checks.push('replacement versions remain Uploaded');
 const request=await ok('/documents','POST',form('request.pdf','%PDF-1.7\nSynthetic upload\n%%EOF',{projectId:'library-project',type:'contract',title:'Signature required',requiresSignature:'true'}));assert.equal(request.status,'draft');checks.push('signature-required documents retain their draft workflow');
 const html='<!doctype html><html><head><style>body{background:#f7faf9;color:#175c4a;font-family:Arial;padding:32px}h1{font-size:32px}</style></head><body><h1>GrowthCast SOP</h1><p>Step one: review the client brief.</p><script>parent.document.body.dataset.previewEscaped="yes"</script><a href="https://example.invalid">External link</a></body></html>';
 let htmlFile;
 for(const ext of ['doc','docx','xls','xlsx','md','csv','html','pdf']){const f=await ok('/library/upload','POST',form('SOP.'+ext,ext==='html'?html:'Synthetic SOP'));if(ext==='html')htmlFile=f;}
 assert.equal((await ok('/library')).meta.total,8);assert.equal((await ok('/library?page=2&limit=3')).data.length,3);checks.push('Library accepts requested formats and paginates originals');
 assert.equal((await api('/library/upload','POST',form('bad.exe'))).status,400);checks.push('unsupported executable upload denied');
 assert.equal((await api('/library/'+htmlFile.id+'/share','POST',{projectId:'library-other-project'})).status,404);
 await pool.query('UPDATE gc_atrium.library_file SET "organizationId"=$2 WHERE id=$1',[htmlFile.id,'runtime-other-org']);assert.equal((await api('/library/'+htmlFile.id+'/download')).status,404);await pool.query('UPDATE gc_atrium.library_file SET "organizationId"=$2 WHERE id=$1',[htmlFile.id,'runtime-org']);checks.push('foreign originals and projects denied');
 const copies=await Promise.all([1,2,3].map(()=>ok('/library/'+htmlFile.id+'/share','POST',{projectId:'library-project'})));assert.equal(new Set(copies.map(f=>f.id)).size,1);const fileId=copies[0].id;checks.push('concurrent sharing retries produce one project copy');
 const download=await api('/files/'+fileId+'/download');assert.equal(await download.text(),html);assert.match(download.headers.get('content-disposition'),/^attachment/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');checks.push('project copy preserves exact bytes with safe direct-download headers');
 await pool.query("UPDATE gc_atrium.member SET role='member' WHERE \"userId\"=$1",[state.identity]);assert.equal((await api('/library')).status,403);await role('member');assert.equal((await api('/library/'+htmlFile.id+'/download')).status,403);assert.equal((await api('/library/'+htmlFile.id+'/share','POST',{projectId:'library-project'})).status,403);assert.equal((await api('/library/'+htmlFile.id+'/archive','POST',{})).status,403);assert.equal((await api('/files/'+fileId+'/download')).status,200);
 await pool.query("DELETE FROM gc_atrium.project_client WHERE id='library-assignment'");assert.equal((await api('/files/'+fileId+'/download')).status,403);await pool.query('INSERT INTO gc_atrium.project_client(id,"projectId","userId") VALUES($1,$2,$3)',['library-assignment','library-project',state.identity]);checks.push('clients can only read assigned project copies; membership removal revokes access');
 await role('admin');await ok('/library/'+htmlFile.id+'/archive','POST',{});assert.equal((await api('/library/'+htmlFile.id+'/download')).status,404);assert.equal((await api('/library/'+htmlFile.id+'/share','POST',{projectId:'library-project'})).status,404);assert.equal(await (await api('/files/'+fileId+'/download')).text(),html);checks.push('archiving the original preserves previously shared project files');
 assert.equal((await (await fetch('http://mail:1080/email')).json()).length,beforeMail);checks.push('uploads and Library sharing send no emails');
 // Restore one visible HTML original for the independent browser review.
 await pool.query('UPDATE gc_atrium.library_file SET "archivedAt"=NULL WHERE id=$1',[htmlFile.id]);
 writeFileSync('/evidence.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,passed:checks.length,cloudWrites:0,realPackagedApi:true},null,2)+'\n');console.log('File Library API checks passed: '+checks.length);
}finally{await pool.end();}
