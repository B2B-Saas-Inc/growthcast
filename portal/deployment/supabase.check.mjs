import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseConnection} from './supabase-config.mjs';
const projectRef='abcdefghijklmnopqrst';
const direct=`postgresql://gc_app:synthetic@db.${projectRef}.supabase.co:5432/postgres`;
test('direct connections force verified TLS and read-only startup',()=>{
 const c=supabaseConnection({url:direct+'?sslmode=require',projectRef});assert.equal(c.ssl.rejectUnauthorized,true);assert.equal(c.options,'-c default_transaction_read_only=on');assert.equal(c.user,'gc_app');assert.equal(c.ssl.ca,undefined);
});
test('session pooler custom roles retain project suffix and supplied CA',()=>{
 for(const role of ['gc_app','gc_documenso','gc_documenso_migrate','gc_backup']) {const c=supabaseConnection({url:`postgresql://${role}.${projectRef}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,projectRef,ca:'synthetic CA'});assert.equal(c.user,role+'.'+projectRef);assert.equal(c.ssl.ca,'synthetic CA');}
});
test('transaction mode, wrong project and untrusted hosts are rejected',()=>{
 for(const url of [direct.replace(':5432',':6543'),direct.replace(projectRef,'zzzzzzzzzzzzzzzzzzzz'),direct.replace('.supabase.co','.evil.test'),direct.replace('/postgres','/other'),direct.replace('gc_app','unexpected')])assert.throws(()=>supabaseConnection({url,projectRef}));
 assert.throws(()=>supabaseConnection({url:direct,projectRef:''}));
});
test('URL options cannot disable TLS or inject session settings',()=>{
 for(const query of ['sslmode=disable','sslmode=no-verify','sslrootcert=bad','options=unsafe'])assert.throws(()=>supabaseConnection({url:direct+'?'+query,projectRef}));
});
