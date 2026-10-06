import pg from 'pg';
import {readFileSync} from 'node:fs';
export function connect(role=process.env.DB_ROLE,host=process.env.DB_HOST||'database') {
  if(!['postgres','gc_migrate','gc_app','gc_lifecycle','gc_gateway'].includes(role)||!['database','restore'].includes(host))throw Error('Local foundation scope required');
  const password=readFileSync('/credential/password','utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(password))throw Error('Generated credential required');
  return new pg.Client({user:role,password,host,database:'foundation_test',port:5432,
    ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true},connectionTimeoutMillis:3000,
    statement_timeout:10000,query_timeout:12000});
}
