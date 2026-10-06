import assert from 'node:assert/strict';
import pg from 'pg';
import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {connect} from './db.mjs';
import {guard,migrate,hash,files} from './migrate.mjs';
const db=connect();
await db.connect();
const mode=process.argv[2];
try {
  if(mode==='migrate') {await migrate(db);await migrate(db);console.log('Versioned migrations applied; second application is a no-op.');}
  else if(mode==='seed-provider') {
    const binding={environment:'local-test',organizationId:'restore-org',clientId:'restore-project',documentVersion:'restore-document-v1',envelopeId:'foundation-envelope',documentId:1,recipientId:1,recipientToken:'synthetic-recipient',recipientName:'Invited',recipientEmail:'invited@example.test',fieldIds:[],items:[{id:'foundation-item',dataId:'source-data'}]};
    await db.query("INSERT INTO grants(id,binding,expires_at) VALUES('11111111-1111-4111-8111-111111111111',$1,now()+interval '1 hour')",[binding]);
    await db.query("INSERT INTO provider_documents VALUES('restore-document','documenso','foundation-envelope')");
    await db.query("INSERT INTO sealed_artifacts VALUES('11111111-1111-4111-8111-111111111111','foundation-item','sealed-data',$1)",[hash(await readFile('/artifacts/contract.pdf'))]);
    await db.query("INSERT INTO provider_completions(document_id,grant_id,item_id,data_id,sha256) SELECT 'restore-document',grant_id,item_id,data_id,sha256 FROM sealed_artifacts");
    console.log('Synthetic canonical completion seeded by isolated migration fixture.');
  }
  else if(mode==='guard') {await guard(db);console.log('Runtime schema guard passed without performing DDL.');}
  else if(mode==='pre-migration') {await assert.rejects(()=>guard(db));console.log('Unmigrated runtime startup rejected.');}
  else if(mode==='transport') {
    assert(!existsSync('/provision'));assert(!existsSync('/secrets'));assert(!existsSync('/tls/server.key'));
    const config={host:'database',database:'foundation_test',user:'gc_app',password:(await readFile('/credential/password','utf8')).trim(),connectionTimeoutMillis:3000};
    const ca=await readFile('/ca/server.crt','utf8');
    for(const options of [{ssl:false},{ssl:{ca:[],rejectUnauthorized:true}},{host:'wrong.invalid',ssl:{ca,rejectUnauthorized:true}},{user:'gc_migrate',ssl:{ca,rejectUnauthorized:true}}]) {
      const denied=new pg.Client({...config,...options});
      try {await assert.rejects(()=>denied.connect());}finally {await denied.end();}
    }
    console.log('Plaintext, untrusted CA, wrong TLS hostname and runtime-to-migration authentication denied.');
  }
  else if(mode==='seed') {
    await guard(db);
    const bytes=Buffer.from('%PDF-1.4\nGrowthCast synthetic recovery artifact\n%%EOF\n');
    await writeFile('/artifacts/contract.pdf',bytes);
    await db.query(`INSERT INTO "user"(id,name,email,"updatedAt") VALUES('restore-user','Synthetic','restore@example.test',now());
      INSERT INTO organization(id,name,"updatedAt") VALUES('restore-org','Synthetic',now());
      INSERT INTO project(id,name,"organizationId","updatedAt") VALUES('restore-project','Synthetic','restore-org',now());`);
    await db.query(`INSERT INTO file(id,filename,"storageKey",description,"sizeBytes","projectId","organizationId","uploadedById") VALUES('restore-file','contract.pdf','contract.pdf',$1,$2,'restore-project','restore-org','restore-user')`,[hash(bytes),bytes.length]);
    await db.query(`INSERT INTO document(id,type,title,"fileId","projectId","organizationId","uploadedById","updatedAt") VALUES('restore-document','contract','Synthetic restore contract','restore-file','restore-project','restore-org','restore-user',now())`);
    for(const sql of ['SELECT * FROM gc_documenso."user"','CREATE TABLE gc_atrium.escape(id integer)','UPDATE portal_meta.schema_state SET fingerprint=\'forged\'','DELETE FROM provider_completions','DELETE FROM sealed_artifacts','SET ROLE gc_migrate'])await assert.rejects(()=>db.query(sql));
    assert.equal((await db.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0].ssl,true);
    console.log('Synthetic Atrium document/artifact seeded over verified TLS; runtime DDL and provider-truth writes denied.');
  } else if(mode==='verify') {
    await guard(db);
    const {rows}=await db.query(`SELECT f.filename,f.description,f."sizeBytes",d.title FROM document d JOIN file f ON f.id=d."fileId" WHERE d.id='restore-document' AND d."organizationId"='restore-org'`);
    assert.equal(rows.length,1);
    const bytes=await readFile('/artifacts/contract.pdf');
    assert.equal(hash(bytes),rows[0].description);assert.equal(bytes.length,rows[0].sizeBytes);
    assert.equal(rows[0].title,'Synthetic restore contract');
    const sealed=(await db.query('SELECT data_id,sha256 FROM sealed_artifacts')).rows;
    assert.equal(sealed.length,3);assert(sealed.every(a=>a.data_id==='sealed-data'&&a.sha256===hash(bytes)));
    const accounts=await db.query(`SELECT u."emailVerified",count(s.id)::int AS sessions FROM "user" u JOIN "session" s ON s."userId"=u.id WHERE u.email='invited@example.test' GROUP BY u.id`);
    assert.equal(accounts.rows.length,1);assert.equal(accounts.rows[0].emailVerified,true);assert(accounts.rows[0].sessions>0);
    await assert.rejects(()=>db.query('CREATE TABLE gc_atrium.restore_escape(id integer)'));
    await assert.rejects(()=>db.query('DELETE FROM provider_completions'));
    console.log('Persisted/restored Atrium record, artifact length/hash and runtime restrictions verified.');
  } else if(mode==='drift') {
    await db.query('ALTER TABLE gc_atrium.project ADD COLUMN unexpected_probe text');
    await assert.rejects(()=>guard(db),/Schema drift/);
    await assert.rejects(()=>migrate(db),/Schema drift/);
    await db.query('ALTER TABLE gc_atrium.project DROP COLUMN unexpected_probe');
    // A dropped trailing column leaves catalog attribute numbers unchanged for existing columns.
    await guard(db);
    await db.query("UPDATE portal_meta.migrations SET sha256='tampered' WHERE name=$1",[(await files())[0].name]);
    await assert.rejects(()=>guard(db),/checksum/);
    await assert.rejects(()=>migrate(db),/history mismatch/);
    await db.query('UPDATE portal_meta.migrations SET sha256=$2 WHERE name=$1',[(await files())[0].name,(await files())[0].sha256]);
    await guard(db);
    console.log('Schema drift and migration checksum tampering rejected; original state restored.');
  } else throw Error('Unknown foundation action');
} finally {await db.end();}
