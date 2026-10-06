import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function fingerprint(db,version=1) {
  if(![1,2].includes(version))throw Error('Unsupported fingerprint version');
  const {rows}=await db.query(`SELECT kind,name,definition FROM (
    SELECT 'column' AS kind,c.relname||'.'||a.attname AS name,
      concat_ws('|',CASE WHEN $1=2 THEN row_number() OVER (PARTITION BY c.oid ORDER BY a.attnum) ELSE a.attnum END,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) AS definition
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='gc_documenso' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint',c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='gc_documenso'
    UNION ALL SELECT 'index',indexname,indexdef FROM pg_indexes WHERE schemaname='gc_documenso'
    UNION ALL SELECT 'trigger',t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='gc_documenso' AND NOT t.tgisinternal
    UNION ALL SELECT 'function',p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='gc_documenso'
    UNION ALL SELECT 'enum',t.typname||'.'||e.enumsortorder,e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='gc_documenso'
  ) definitions ORDER BY kind,name`,[version]);
  return hash(JSON.stringify(rows));
}
