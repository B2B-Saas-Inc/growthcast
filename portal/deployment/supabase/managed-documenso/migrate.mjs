import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fingerprint} from './fingerprint.mjs';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export function files() {
 const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url)));
 return manifest.migrations.map(e=>{
  if(!/^\d{14}_[a-zA-Z0-9_]+$/.test(e.name))throw Error('Invalid migration name');
  const sql=readFileSync(new URL('./migrations/'+e.name+'/migration.sql',import.meta.url),'utf8');
  if(hash(sql)!==e.sha256)throw Error('Migration checksum mismatch');return {...e,sql};
 });
}
async function namespace(db) {
 if((await db.query('SELECT current_schema() AS schema')).rows[0].schema!=='gc_documenso')throw Error('Private Documenso namespace required');
}
export async function guard(db) {
 await namespace(db);
 const expected=files().map(({name,sha256})=>({name,sha256}));
 const applied=(await db.query('SELECT name,sha256 FROM _growthcast_migrations ORDER BY name')).rows;
 if(JSON.stringify(expected)!==JSON.stringify(applied))throw Error('Migration checksum/history mismatch');
 const saved=(await db.query(`SELECT fingerprint,COALESCE((to_jsonb(s)->>'fingerprint_version')::int,1) AS version FROM _growthcast_schema_state s WHERE id=1`)).rows[0];
 if(!saved||saved.fingerprint!==await fingerprint(db,saved.version))throw Error('Schema drift');
}
export async function migrate(db) {
 await namespace(db);const expected=files();
 if((await db.query('SELECT current_user')).rows[0].current_user!=='gc_documenso_migrate')throw Error('Dedicated migration role required');
 // Session pooling required: upstream enum alterations must commit before later migrations use them.
 await db.query('SELECT pg_advisory_lock(7814203)');
 try {
  await db.query('CREATE TABLE IF NOT EXISTS _growthcast_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS _growthcast_schema_state(id integer PRIMARY KEY CHECK(id=1),fingerprint text NOT NULL)');
  const existing=(await db.query('SELECT name,sha256 FROM _growthcast_migrations ORDER BY name')).rows;
  if(existing.some((e,i)=>e.name!==expected[i]?.name||e.sha256!==expected[i]?.sha256))throw Error('Migration history mismatch');
  const saved=(await db.query(`SELECT fingerprint,COALESCE((to_jsonb(s)->>'fingerprint_version')::int,1) AS version FROM _growthcast_schema_state s WHERE id=1`)).rows[0];
  if(saved&&saved.fingerprint!==await fingerprint(db,saved.version))throw Error('Schema drift before migration');
  for(const entry of expected.slice(existing.length)) {
   await db.query('BEGIN');
   try {
    await db.query(entry.sql);
    await db.query('INSERT INTO _growthcast_migrations(name,sha256) VALUES($1,$2)',[entry.name,entry.sha256]);
    await db.query('INSERT INTO _growthcast_schema_state(id,fingerprint) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint',[await fingerprint(db,(await db.query("SELECT COALESCE((to_jsonb(s)->>'fingerprint_version')::int,1) AS version FROM _growthcast_schema_state s WHERE id=1")).rows[0]?.version??1)]);
    await db.query('COMMIT');
   } catch(e) {await db.query('ROLLBACK');throw e;}
  }
  await guard(db);
 } finally {await db.query('SELECT pg_advisory_unlock(7814203)');}
}
