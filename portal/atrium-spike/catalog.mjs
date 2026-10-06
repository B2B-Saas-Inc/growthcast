import { authorizeAccount, mintAccountHandoff } from './claims.mjs';
const query = `SELECT c.*,d.title,d.type,g.binding,g.expires_at AS grant_expiry
  FROM portal_claims c JOIN grants g ON g.id=c.grant_id
  JOIN document d ON d.id=c.document_id
  JOIN provider_documents p ON p.document_id=d.id AND p.external_id=g.binding->>'envelopeId'
  WHERE c.user_id=$1 AND c.consumed_at IS NOT NULL AND g.generation=c.generation
    AND g.revoked_at IS NULL AND g.expires_at>now()`;
const contextFor = (row,identity) => ({ sourceGrant:row.grant_id,generation:row.generation,
  documentId:row.document_id,documentVersion:row.document_version,fileId:row.file_id,
  projectId:row.project_id,sessionId:identity.sessionId,userId:identity.userId });
export function createCatalog(pool) {
  return {
    async list(identity) {
      if (!identity?.userId || !identity?.sessionId) return [];
      const {rows} = await pool.query(query+' ORDER BY c.consumed_at DESC LIMIT 100',[identity.userId]);
      const documents = new Map();
      for (const row of rows) if (!documents.has(row.document_id) && await authorizeAccount(contextFor(row,identity),pool))
        documents.set(row.document_id,{id:row.document_id,title:row.title,type:row.type,status:'Completed'});
      return [...documents.values()];
    },
    async open(documentId,identity) {
      if (typeof documentId !== 'string' || !identity?.userId || !identity?.sessionId) return null;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const {rows} = await client.query(query+' AND c.document_id=$2 ORDER BY c.consumed_at DESC LIMIT 1 FOR UPDATE OF c,g',[identity.userId,documentId]);
        const row = rows[0], context = row && contextFor(row,identity);
        if (!row || !await authorizeAccount(context,client)) { await client.query('ROLLBACK'); return null; }
        const handoff = await mintAccountHandoff(client,row,context);
        await client.query('COMMIT');
        return {handoff};
      } catch(error) {await client.query('ROLLBACK');throw error;}
      finally {client.release();}
    },
  };
}
