import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function files() {
  const manifest=JSON.parse(await readFile(new URL('./migrations/manifest.json',import.meta.url),'utf8'));
  const result=[];
  for(const entry of manifest.migrations) {
    if(!/^\d{3}-[a-z-]+\.sql$/.test(entry.name))throw Error('Invalid migration name');
    const sql=await readFile(new URL('./migrations/'+entry.name,import.meta.url),'utf8');
    if(hash(sql)!==entry.sha256)throw Error('Migration checksum mismatch');
    result.push({...entry,sql});
  }
  return result;
}
export async function fingerprint(db) {
  const {rows}=await db.query(`SELECT kind,name,definition FROM (
    SELECT 'column' AS kind,c.relname||'.'||a.attname AS name,
      concat_ws('|',a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) AS definition
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='gc_atrium' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint',c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='gc_atrium'
    UNION ALL SELECT 'index',indexname,indexdef FROM pg_indexes WHERE schemaname='gc_atrium'
    UNION ALL SELECT 'trigger',t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='gc_atrium' AND NOT t.tgisinternal
    UNION ALL SELECT 'function',p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='gc_atrium'
    UNION ALL SELECT 'enum',t.typname||'.'||e.enumsortorder,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='gc_atrium'
  ) definitions ORDER BY kind,name`);
  return hash(JSON.stringify(rows));
}
export async function namespace(db) {
  if((await db.query('SELECT current_schema() AS schema')).rows[0].schema!=='gc_atrium')throw Error('Managed Atrium namespace required');
}
export async function guard(db) {
  await namespace(db);
  const expected=await files();
  const applied=(await db.query('SELECT name,sha256 FROM portal_meta.migrations ORDER BY name')).rows;
  if(JSON.stringify(applied)!==JSON.stringify(expected.map(({name,sha256})=>({name,sha256}))))throw Error('Schema version/checksum mismatch');
  const saved=(await db.query('SELECT fingerprint FROM portal_meta.schema_state WHERE id=1')).rows[0];
  if(!saved||saved.fingerprint!==await fingerprint(db))throw Error('Schema drift');
}
export async function migrate(db) {
  await namespace(db);
  if((await db.query('SELECT current_user')).rows[0].current_user!=='gc_migrate')throw Error('Migration identity required');
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(7814201)');
    await db.query('CREATE TABLE IF NOT EXISTS portal_meta.migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query('CREATE TABLE IF NOT EXISTS portal_meta.schema_state(id integer PRIMARY KEY CHECK(id=1),fingerprint text NOT NULL)');
    const expected=await files();
    const existing=(await db.query('SELECT name,sha256 FROM portal_meta.migrations ORDER BY name')).rows;
    if(existing.some((e,i)=>e.name!==expected[i]?.name||e.sha256!==expected[i]?.sha256))throw Error('Migration history mismatch');
    const saved=(await db.query('SELECT fingerprint FROM portal_meta.schema_state WHERE id=1')).rows[0];
    if(saved&&saved.fingerprint!==await fingerprint(db))throw Error('Schema drift before migration');
    for(const entry of expected.slice(existing.length)) {
      await db.query(entry.sql);
      await db.query('INSERT INTO portal_meta.migrations(name,sha256) VALUES($1,$2)',[entry.name,entry.sha256]);
    }
    await db.query('INSERT INTO portal_meta.schema_state(id,fingerprint) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint',[await fingerprint(db)]);
    await db.query('COMMIT');
  } catch(error) {await db.query('ROLLBACK');throw error;}
}
