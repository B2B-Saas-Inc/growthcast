import { randomUUID } from 'node:crypto';
import { digest, secret } from '../../gateway/src/store.mjs';

// Runs on every handoff redemption and account-derived gateway authorization.
// The gateway refuses account grants altogether if this validator is absent.
export async function authorizeAccount(context, db) {
  const { rows } = await db.query(`SELECT 1 FROM grants g
    JOIN "session" s ON s.id=$2 AND s."userId"=$3 AND s."expiresAt">now()
    JOIN "user" u ON u.id=s."userId" AND u."emailVerified"=true
    JOIN member m ON m."userId"=u.id AND m."organizationId"=g.binding->>'organizationId'
    JOIN project p ON p.id=$4 AND p."organizationId"=m."organizationId"
    JOIN project_client pc ON pc."projectId"=p.id AND pc."userId"=u.id
    JOIN document d ON d.id=$5 AND d."projectId"=p.id AND d."organizationId"=m."organizationId"
    WHERE g.id=$1::uuid AND g.revoked_at IS NULL AND g.expires_at>now()
      AND g.generation=$6 AND s."activeOrganizationId"=m."organizationId"
      AND lower(u.email)=lower(g.binding->>'recipientEmail')
      AND d."currentVersion"=$7 AND d."fileId"=$8
      AND (CASE WHEN EXISTS(SELECT 1 FROM provider_documents pd WHERE pd.document_id=d.id)
        THEN EXISTS(SELECT 1 FROM provider_completions c JOIN sealed_artifacts a ON a.grant_id=c.grant_id AND a.item_id=c.item_id
          WHERE c.document_id=d.id AND c.grant_id=g.id AND a.data_id=c.data_id AND a.sha256=c.sha256)
        ELSE d.status='signed' END)`,
  [context.sourceGrant, context.sessionId, context.userId, context.projectId, context.documentId, context.generation, context.documentVersion, context.fileId]);
  return rows.length === 1;
}

export function createClaims(pool) {
  return {
    // Trusted fixture/lifecycle entrypoint only, never exposed as an HTTP route.
    async provision(grantId, documentId) {
      const token = secret();
      const result = await pool.query(`INSERT INTO portal_claims
        (token_hash,grant_id,generation,document_id,document_version,file_id,project_id,expires_at)
        SELECT $1,g.id,g.generation,d.id,d."currentVersion",d."fileId",d."projectId",LEAST(g.expires_at,now()+interval '10 minutes')
        FROM grants g JOIN document d ON d.id=$3
        WHERE g.id=$2::uuid AND g.revoked_at IS NULL AND g.expires_at>now()
          AND d."organizationId"=g.binding->>'organizationId'
          AND d."projectId"=g.binding->>'clientId'
          AND d.id || '-v' || d."currentVersion"::text = g.binding->>'documentVersion'
          AND (CASE WHEN EXISTS(SELECT 1 FROM provider_documents pd WHERE pd.document_id=d.id)
            THEN EXISTS(SELECT 1 FROM provider_completions c WHERE c.document_id=d.id AND c.grant_id=g.id)
            ELSE d.status='signed' END)`, [digest(token), grantId, documentId]);
      if (result.rowCount !== 1) throw Error('No approved completed document binding');
      return token;
    },
    async claim(token, identity) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !identity?.sessionId || !identity?.userId) return null;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT c.*,g.binding,g.expires_at AS grant_expiry
          FROM portal_claims c JOIN grants g ON g.id=c.grant_id
          WHERE c.token_hash=$1 AND c.consumed_at IS NULL AND c.expires_at>now()
            AND g.revoked_at IS NULL AND g.expires_at>now() AND g.generation=c.generation
          FOR UPDATE OF c,g`, [digest(token)]);
        const row = rows[0];
        const context = row && { sourceGrant: row.grant_id, generation: row.generation,
          documentId: row.document_id, documentVersion: row.document_version, fileId: row.file_id,
          projectId: row.project_id, sessionId: identity.sessionId, userId: identity.userId };
        if (!row || !await authorizeAccount(context, client)) { await client.query('ROLLBACK'); return null; }
        const handoff = await mintAccountHandoff(client,row,context);
        await client.query('UPDATE portal_claims SET consumed_at=now(),user_id=$2 WHERE token_hash=$1', [digest(token),identity.userId]);
        await client.query('INSERT INTO portal_claim_audit(claim_hash,user_id) VALUES($1,$2)',[digest(token),identity.userId]);
        await client.query('COMMIT');
        return { handoff };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}

export async function mintAccountHandoff(client,row,context) {
  const grantId = randomUUID(), handoff = secret();
  await client.query('INSERT INTO grants(id,binding,expires_at) VALUES($1,$2,$3)', [grantId,row.binding,row.grant_expiry]);
  await client.query('INSERT INTO account_grants(grant_id,context) VALUES($1,$2)', [grantId,context]);
  await client.query('SELECT copy_account_artifacts($1)',[grantId]);
  await client.query("INSERT INTO handoffs(token_hash,grant_id,generation,expires_at) VALUES($1,$2,0,now()+interval '60 seconds')", [digest(handoff),grantId]);
  return handoff;
}
