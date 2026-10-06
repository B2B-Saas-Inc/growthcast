import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const db=new pg.Client({host:'db.abcdefghijklmnopqrst.supabase.co',database:'postgres',user:'postgres',password:readFileSync('/admin/password','utf8'),ssl:{ca:readFileSync('/runtime/database-ca.crt','utf8'),rejectUnauthorized:true}});
await db.connect();
try{
 await db.query('BEGIN; SET ROLE gc_migrate; SET LOCAL search_path=gc_atrium,pg_catalog');
 await db.query('DROP TABLE gc_atrium.library_share; DROP TABLE gc_atrium.library_file');
 await db.query(`INSERT INTO organization(id,name,"updatedAt") VALUES('library-migration-org','Synthetic',now());INSERT INTO project(id,name,"organizationId","updatedAt") VALUES('library-migration-project','Synthetic','library-migration-org',now());`);
 for(const kind of ['plain','whitespace','approval','signature','signed','provider','response','draft']){
  const id='library-migration-'+kind;
  await db.query('INSERT INTO file(id,filename,"projectId","organizationId","uploadedById","updatedAt") VALUES($1,\'synthetic.pdf\',\'library-migration-project\',\'library-migration-org\',\'fixture\',now())',[id]);
  await db.query('INSERT INTO document(id,type,title,"fileId","projectId","organizationId","uploadedById",status,"requiresApproval","requiresSignature",options,"reminderEnabled","expiresAt","updatedAt") VALUES($1,\'contract\',\'Synthetic\',$1,\'library-migration-project\',\'library-migration-org\',\'fixture\',$2,$3,$4,$5,true,now()+interval \'1 day\',now())',[id,kind==='signed'?'signed':kind==='draft'?'draft':'pending',kind==='approval',kind==='signature',kind==='whitespace'?'  ':null]);
 }
 await db.query("INSERT INTO provider_documents VALUES('library-migration-provider','documenso','synthetic-library-envelope')");
 await db.query(`INSERT INTO "user"(id,name,email,"emailVerified","updatedAt") VALUES('library-migration-user','Synthetic','library-migration@growthcast.invalid',true,now());INSERT INTO document_response(id,"documentId","userId",action) VALUES('library-migration-response','library-migration-response','library-migration-user','acknowledged')`);
 await db.query(readFileSync('/foundation/library/009-file-library.sql','utf8'));
 const rows=(await db.query('SELECT id,status,"reminderEnabled","expiresAt" FROM document WHERE "organizationId"=\'library-migration-org\'')).rows;
 for(const row of rows){const kind=row.id.replace('library-migration-','');assert.equal(row.status,['plain','whitespace'].includes(kind)?'uploaded':kind==='signed'?'signed':kind==='draft'?'draft':'pending');if(row.status==='uploaded'){assert.equal(row.reminderEnabled,false);assert.equal(row.expiresAt,null);}}
 assert.equal((await db.query("SELECT count(*)::int AS n FROM document_audit_event WHERE action='upload_status_corrected' AND \"documentId\" LIKE 'library-migration-%'")).rows[0].n,2);
 console.log('Migration regression passed: upload-only correction; approval, signature, provider, response, completed and draft history preserved.');
}finally{await db.query('ROLLBACK');await db.end();}
