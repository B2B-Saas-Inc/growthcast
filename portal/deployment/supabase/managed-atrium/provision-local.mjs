// Disposable Compose databases only; never use this fixture on Supabase.
import {readFileSync} from 'node:fs';
import {connect} from './db.mjs';
for(const host of ['database','restore']) {
 const db=connect('postgres',host);await db.connect();
 try {
  await db.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS');
  await db.query(readFileSync('/managed/isolation.sql','utf8'));
  await db.query(`SET ROLE gc_documenso_migrate; CREATE TABLE gc_documenso."user"(id text PRIMARY KEY); INSERT INTO gc_documenso."user" VALUES('synthetic-provider-only'); RESET ROLE`);
  for(const role of ['gc_migrate','gc_app','gc_lifecycle','gc_gateway']) {
   const password=readFileSync('/provision/'+role+'/password','utf8').trim();
   if(!/^[a-f0-9]{64}$/.test(password))throw Error('Generated fixture credential required');
   await db.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  }
 } finally {await db.end();}
}
console.log('Disposable managed-schema fixtures provisioned.');
