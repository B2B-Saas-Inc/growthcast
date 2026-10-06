// Actual PostgreSQL databases with different locale providers must produce the same row proof.
import assert from 'node:assert/strict';
import pg from 'pg';
import {catalog} from '../managed-recovery/catalog.mjs';
const config={host:'database',user:'postgres',database:'postgres'};
const admin=new pg.Client(config);await admin.connect();
const clients=[];
try {
 for(const [name,locale] of [['catalog_c',"LOCALE_PROVIDER libc LC_COLLATE 'C' LC_CTYPE 'C'"],['catalog_icu',"LOCALE_PROVIDER icu ICU_LOCALE 'en-US'"]]) {
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ${locale}`);
  const db=new pg.Client({...config,database:name});await db.connect();clients.push(db);
  await db.query('CREATE SCHEMA gc_atrium; CREATE TABLE gc_atrium.session(id text, n integer)');
  for(const id of ['a-b','ab','a_b','A','a','ä','z','Z'])await db.query('INSERT INTO gc_atrium.session VALUES($1,1)',[id]);
 }
 const legacy=await Promise.all(clients.map(db=>catalog(db)));
 assert.notEqual(legacy[0][0].digest,legacy[1][0].digest,'Fixture must reproduce locale-dependent legacy hashes');
 const canonical=await Promise.all(clients.map(db=>catalog(db,{bytewise:true})));
 assert.deepEqual(canonical[0],canonical[1]);
 await clients[1].query("UPDATE gc_atrium.session SET n=2 WHERE id='a-b'");
 assert.notEqual((await catalog(clients[1],{bytewise:true}))[0].digest,canonical[0][0].digest,'Real row changes remain detectable');
 console.log('Catalog proofs match across libc/ICU; legacy difference reproduced and actual data changes rejected.');
} finally {for(const db of clients)await db.end();await admin.end();}
