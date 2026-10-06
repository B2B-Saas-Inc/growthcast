// Real PostgreSQL proof that concurrent application commits cannot split the two dumps.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {capture} from './capture-core.mjs';
const config={host:'database',user:'postgres',database:'postgres'};
const owner=new pg.Client(config),reader=new pg.Client({...config,user:'gc_backup'});
const directory=mkdtempSync(join(tmpdir(),'snapshot-check-'));
try {
  await owner.connect();
  await owner.query("CREATE ROLE gc_backup LOGIN; CREATE SCHEMA gc_atrium; CREATE SCHEMA gc_documenso; CREATE TABLE gc_atrium.fixture(id integer); CREATE TABLE gc_documenso.fixture(id integer); INSERT INTO gc_atrium.fixture VALUES(1); INSERT INTO gc_documenso.fixture VALUES(1); GRANT USAGE ON SCHEMA gc_atrium,gc_documenso TO gc_backup; GRANT SELECT ON gc_atrium.fixture,gc_documenso.fixture TO gc_backup");
  await reader.connect();let snapshot;
  const source={
    lock:async()=>(await reader.query('SELECT pg_try_advisory_lock(7814206) AS locked')).rows[0].locked,
    unlock:()=>reader.query('SELECT pg_advisory_unlock(7814206)'),
    begin:()=>reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),commit:()=>reader.query('COMMIT'),rollback:()=>reader.query('ROLLBACK'),
    snapshot:async()=>{snapshot=(await reader.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;return snapshot;},
    guard:async()=>{},objects:async()=>[],references:async()=>[],roles:async()=>[],
    catalog:async()=>(await reader.query('SELECT count(*)::int AS count FROM gc_atrium.fixture')).rows,
    dump:async(exported,path)=>{
      assert.equal(exported,snapshot);
      // A second reader cannot acquire the same session lock while capture is active.
      assert.equal((await owner.query('SELECT pg_try_advisory_lock(7814206) AS locked')).rows[0].locked,false);
      const env={PATH:process.env.PATH,PGHOST:'database',PGUSER:'gc_backup',PGDATABASE:'postgres'};
      for(const schema of ['gc_atrium','gc_documenso']) {
        // Commit new application rows before EACH dump; both still see the original snapshot.
        await owner.query('BEGIN; INSERT INTO gc_atrium.fixture VALUES(2); INSERT INTO gc_documenso.fixture VALUES(2); COMMIT');
        execFileSync('pg_dump',['--format=custom','--snapshot='+exported,'--schema='+schema,'-f',join(path,schema+'.dump')],{env,stdio:'pipe'});
      }
    },bundle:async()=>{}
  };
  const result=await capture({source,storage:{download:async()=>{throw Error('Unexpected download');}},directory,projectRef:'saedetvoolpdysiyjwvg',bucket:'gc-atrium-private',storageSubject:'fixture'});
  assert.equal(result.rows,1);
  assert.equal((await owner.query('SELECT count(*)::int AS count FROM gc_atrium.fixture')).rows[0].count,3);
  await owner.query('CREATE DATABASE restored');
  const env={PATH:process.env.PATH,PGHOST:'database',PGUSER:'postgres',PGDATABASE:'restored'};
  for(const schema of ['gc_atrium','gc_documenso'])execFileSync('pg_restore',['--exit-on-error','-d','restored',join(directory,schema+'.dump')],{env,stdio:'pipe'});
  const target=new pg.Client({...config,database:'restored'});await target.connect();
  try {for(const schema of ['gc_atrium','gc_documenso'])assert.deepEqual((await target.query('SELECT * FROM '+schema+'.fixture')).rows,[{id:1}]);} finally {await target.end();}
  assert.equal((await owner.query('SELECT pg_try_advisory_lock(7814206) AS locked')).rows[0].locked,true);
  await owner.query('SELECT pg_advisory_unlock(7814206)');
  console.log('Both restored dumps share the pre-write snapshot despite intervening committed writes; concurrent capture is excluded and lock released.');
} finally {await reader.end();await owner.end();rmSync(directory,{recursive:true,force:true});}
