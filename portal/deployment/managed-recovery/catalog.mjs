export const schemas = ['gc_atrium','gc_documenso','portal_meta'];
export const ident = value => '"'+value.replaceAll('"','""')+'"';
export async function catalog(db,{bytewise=false}={}) {
  const result=[];
  for (const schema of schemas) {
    const tables=(await db.query(`SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,(SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
        FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,[schema])).rows;
    for (const table of tables) {
      const data=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(value,E'\\n' ORDER BY value${bytewise?' COLLATE "C"':''}),'')) AS digest FROM
        (SELECT to_jsonb(r)::text AS value FROM ${ident(schema)}.${ident(table.name)} r) rows`)).rows[0];
      result.push({schema,...table,...data});
    }
  }
  return result;
}
