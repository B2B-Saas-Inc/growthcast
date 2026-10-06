import {readFileSync} from 'node:fs';
import {connect} from './db.mjs';
for(const host of ['database','restore']) {
  const db=connect('postgres',host);await db.connect();
  try {
    for(const role of ['gc_migrate','gc_app','gc_lifecycle','gc_gateway']) {
      const password=readFileSync('/provision/'+role+'/password','utf8').trim();
      if(!/^[a-f0-9]{64}$/.test(password))throw Error('Generated role credential required');
      await db.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
    }
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query('ALTER SCHEMA public OWNER TO gc_migrate');
    await db.query('CREATE SCHEMA portal_meta AUTHORIZATION gc_migrate');
    await db.query('GRANT CONNECT, CREATE ON DATABASE foundation_test TO gc_migrate');
    await db.query('GRANT CONNECT ON DATABASE foundation_test TO gc_app,gc_lifecycle');
  } finally {await db.end();}
}
console.log('Fresh source/restore databases provisioned with separate roles.');
