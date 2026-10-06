import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function checkCatalog({pool,flow,passed}) {
 const q=(sql,args)=>pool.query(sql,args),clients=Array.from({length:105},()=>randomUUID()),recipients=clients.map(()=>randomUUID()),documents=clients.map(()=>randomUUID());
 const projects=clients.map((_,i)=>'catalog-project-'+String(i).padStart(3,'0'));
 await q('INSERT INTO gc_atrium.guest_client(id,organization_id,name) SELECT id,\'guest-org\',\'Same client name\' FROM unnest($1::uuid[]) id',[clients]);
 await q('INSERT INTO gc_atrium.guest_recipient(id,client_id,organization_id,email) SELECT id,client,\'guest-org\',id::text||\'@example.test\' FROM unnest($1::uuid[],$2::uuid[]) AS x(id,client)',[recipients,clients]);
 await q('INSERT INTO gc_atrium.project(id,name,"organizationId","updatedAt") SELECT id,\'Same project name\',\'guest-org\',now() FROM unnest($1::text[]) id',[projects]);
 await q('INSERT INTO gc_atrium.guest_document(id,client_id,organization_id,project_id,kind) SELECT id,client,\'guest-org\',project,\'contract\' FROM unnest($1::uuid[],$2::uuid[],$3::text[]) AS x(id,client,project)',[documents,clients,projects]);
 const foreignClient=randomUUID(),foreignRecipient=randomUUID(),foreignDocument=randomUUID();
 await q('INSERT INTO gc_atrium.guest_client VALUES($1,\'other-org\',\'Hidden\')',[foreignClient]);
 await q('INSERT INTO gc_atrium.guest_recipient VALUES($1,$2,\'other-org\',\'hidden@example.test\')',[foreignRecipient,foreignClient]);
 await q('INSERT INTO gc_atrium.guest_document VALUES($1,$2,\'other-org\',\'other-project\',\'contract\')',[foreignDocument,foreignClient]);
 const first=await flow.catalog('staff','guest-org');
 for(const collection of ['clients','recipients','projects','documents']) {
  assert.equal(first[collection].items.length,100);assert(first[collection].truncated);assert(first[collection].nextCursor);
  let after,ids=[];
  do {
   const result=await flow.catalog('staff','guest-org',{collection,limit:13,...(after?{after}:{})});assert.deepEqual(Object.keys(result),[collection]);
   const page=result[collection];assert(page.items.length<=13);ids.push(...page.items.map(row=>row.id));
   assert.equal(page.truncated,page.nextCursor!==null);after=page.nextCursor;
  } while(after);
  assert.equal(new Set(ids).size,ids.length,'No duplicates at page boundaries');
  const expected={clients,recipients,projects,documents}[collection];assert(expected.every(id=>ids.includes(id)),'Every seeded record can be reached');
  assert(!ids.some(id=>[foreignClient,foreignRecipient,foreignDocument,'other-project'].includes(id)));
 }
 passed('all four staff collections paginate past 100 without duplicate or cross-organization rows');
 for(const options of [{collection:'unknown'},{collection:'__proto__'},{collection:'clients',limit:0},{collection:'clients',limit:101},{collection:'clients',limit:1.5},{collection:'clients',limit:'10'},{after:clients[0]},{collection:'clients',after:'invalid'},{collection:'projects',after:''},{organizationId:'other-org'},null])await assert.rejects(()=>flow.catalog('staff','guest-org',options));
 passed('invalid pagination bounds, cursors, collections and client-supplied scope fail closed');
 const version1=await q('INSERT INTO gc_atrium.guest_version(id,document_id,client_id,organization_id,version,title,artifact_key,artifact_sha256,created_by) VALUES($1,$2,$3,\'guest-org\',1,\'First\',\'synthetic.pdf\',$4,\'staff\'),($5,$2,$3,\'guest-org\',2,\'Latest\',\'synthetic.pdf\',$4,\'staff\') RETURNING id',[randomUUID(),documents[0],clients[0],'a'.repeat(64),randomUUID()]);
 const findDocument=async id=>{let after;do{const p=(await flow.catalog('staff','guest-org',{collection:'documents',limit:100,...(after?{after}:{})})).documents;const row=p.items.find(row=>row.id===id);if(row)return row;after=p.nextCursor;}while(after);return null;};
 assert.equal((await findDocument(documents[0])).version_id,version1.rows[1].id);
 await q('UPDATE gc_atrium.project SET "archivedAt"=now() WHERE id=$1',[projects[0]]);assert.equal(await findDocument(documents[0]),null);
 await q('UPDATE gc_atrium.project SET "archivedAt"=NULL,"organizationId"=\'other-org\' WHERE id=$1',[projects[0]]);assert.equal(await findDocument(documents[0]),null);
 passed('catalog selects the latest version and hides documents after project archival or reassignment');
 await q("UPDATE gc_atrium.member SET role='member' WHERE id='staff-member'");
 await assert.rejects(()=>flow.catalog('staff','guest-org',{collection:'clients',after:first.clients.nextCursor}));
 await q("UPDATE gc_atrium.member SET role='owner' WHERE id='staff-member'");
 passed('every next-page request rechecks current staff membership');
}
