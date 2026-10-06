import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import { Binding } from './policy.mjs';
import { isDeepStrictEqual } from 'node:util';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function createStore(connectionString, { authorizeAccount, ssl, maxGrantTtl = 3600 } = {}) {
  // No accidental migration or use of staging/production by this spike.
  const url = new URL(connectionString);
  if(process.env.PORTAL_DATABASE_TLS==='1') {
    url.search='';connectionString=url.href;
    ssl={ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true};
  }
  if (!url.pathname.endsWith('_test')) throw new Error('Gateway spike requires a *_test database');
  const pool = new pg.Pool({ connectionString, ...(ssl ? {ssl} : {}), max: 8, connectionTimeoutMillis: 2000,
    query_timeout: 3000, statement_timeout: 2500 });
  return storeWithPool(pool,'local-test',{authorizeAccount,maxGrantTtl});
}
export function storeWithPool(pool,environment,{authorizeAccount,maxGrantTtl=3600}={}) {
  if(!pool?.query||!pool?.connect||!['local-test','staging','production'].includes(environment))throw Error('Verified gateway pool and environment required');
  if(!Number.isInteger(maxGrantTtl)||maxGrantTtl<1||maxGrantTtl>604800)throw Error('Invalid maximum grant TTL');
  const parseBinding=value=>{const binding=Binding.parse(value);if(binding.environment!==environment)throw Error('Gateway environment mismatch');return binding;};
  pool.on('error', () => {}); // Requests fail closed; never log connection strings.
  return {
    pool,
    async issue(binding, ttl = 3600) {
      binding = parseBinding(binding);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > maxGrantTtl) throw new Error('Invalid grant TTL');
      const id = randomUUID();
      const handoff = secret();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO grants(id,binding,expires_at) VALUES($1,$2,now()+$3*interval \'1 second\')', [id, binding, ttl]);
        await client.query('INSERT INTO handoffs(token_hash,grant_id,generation,expires_at) VALUES($1,$2,0,now()+interval \'60 seconds\')', [digest(handoff), id]);
        await client.query('COMMIT');
        return { id, handoff };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async redeem(handoff) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(handoff)) return null;
      const token = secret();
      const csrf = secret();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
          SELECT h.grant_id,h.generation,g.binding,g.expires_at,
            (SELECT context FROM account_grants a WHERE a.grant_id=g.id) AS account_context FROM handoffs h
          JOIN grants g ON g.id=h.grant_id
          WHERE h.token_hash=$1 AND h.consumed_at IS NULL AND h.expires_at>now()
          AND g.expires_at>now() AND g.revoked_at IS NULL AND h.generation=g.generation
          FOR UPDATE OF h,g`, [digest(handoff)]);
        if (!rows.length) { await client.query('ROLLBACK'); return null; }
        const row = rows[0];
        if (row.account_context && (!authorizeAccount || !await authorizeAccount(row.account_context, client))) {
          await client.query('ROLLBACK'); return null;
        }
        const binding = parseBinding(row.binding);
        await client.query('UPDATE handoffs SET consumed_at=now() WHERE token_hash=$1', [digest(handoff)]);
        await client.query(`INSERT INTO sessions(token_hash,grant_id,generation,csrf_hash,expires_at)
          VALUES($1,$2,$3,$4,LEAST($5::timestamptz,now()+interval '1 hour'))`,
        [digest(token), row.grant_id, row.generation, digest(csrf), row.expires_at]);
        await client.query('COMMIT');
        return { token, csrf, binding };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async authorize(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const { rows } = await pool.query(`SELECT g.binding,s.csrf_hash,
        (SELECT context FROM account_grants a WHERE a.grant_id=g.id) AS account_context,
        (SELECT jsonb_agg(jsonb_build_object('id',a.item_id,'dataId',a.data_id))
         FROM sealed_artifacts a WHERE a.grant_id=g.id) AS sealed_items
        FROM sessions s JOIN grants g ON g.id=s.grant_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND g.expires_at>now()
        AND g.revoked_at IS NULL AND s.generation=g.generation`, [digest(token)]);
      if (!rows[0]) return null;
      if (rows[0].account_context && (!authorizeAccount || !await authorizeAccount(rows[0].account_context, pool))) return null;
      const binding = parseBinding(rows[0].binding);
      // Native sealing replaces documentDataId. Only trusted, immutable final
      // artifact records may replace those IDs in the effective read scope.
      binding.items = binding.items.map(item => rows[0].sealed_items?.find(a=>a.id===item.id) || item);
      return { binding: parseBinding(binding), csrfHash: rows[0].csrf_hash };
    },
    async recordSealedArtifact(grantId, expectedBinding, artifact) {
      expectedBinding = parseBinding(expectedBinding);
      if (!artifact || Object.keys(artifact).sort().join() !== 'dataId,id,sha256' ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(artifact.dataId) || !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        !expectedBinding.items.some(i=>i.id===artifact.id)) throw Error('Invalid final artifact');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const {rows} = await client.query('SELECT binding FROM grants WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[grantId]);
        if (!rows[0] || !isDeepStrictEqual(rows[0].binding,expectedBinding)) throw Error('Final artifact binding mismatch');
        await client.query('INSERT INTO sealed_artifacts(grant_id,item_id,data_id,sha256) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[grantId,artifact.id,artifact.dataId,artifact.sha256]);
        const existing = await client.query('SELECT data_id,sha256 FROM sealed_artifacts WHERE grant_id=$1 AND item_id=$2',[grantId,artifact.id]);
        if (existing.rows[0].data_id!==artifact.dataId || existing.rows[0].sha256!==artifact.sha256) throw Error('Final artifact is immutable');
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async revoke(id) {
      await pool.query('UPDATE grants SET revoked_at=now(),generation=generation+1 WHERE id=$1', [id]);
    },
  };
}
