import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { digest, secret } from './store.mjs';

// Fixed, bounded parameters, never supplied by the browser or database.
const derive = (pin,salt) => promisify(argon2)('argon2id',{
  message:pin, nonce:salt, parallelism:1, memory:65536, passes:3, tagLength:32,
});
const validSecret = value => typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function createPinAccess(store) {
  return {
    // Trusted fixture/operator API only. Rotating invalidates every prior
    // signing session and handoff; the approved source binding is unchanged.
    async provision(grantId) {
      const pin=String(randomInt(100000000)).padStart(8,'0');
      const salt=randomBytes(16), share=secret();
      const hash=await derive(pin,salt);
      const client=await store.pool.connect();
      try {
        await client.query('BEGIN');
        const {rows}=await client.query(`UPDATE grants SET generation=generation+1
          WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING generation`,[grantId]);
        if(!rows[0])throw Error('Unavailable grant');
        await client.query('DELETE FROM pin_shares WHERE grant_id=$1',[grantId]);
        await client.query('INSERT INTO pin_shares(share_hash,grant_id,generation,salt,pin_hash) VALUES($1,$2,$3,$4,$5)',[digest(share),grantId,rows[0].generation,salt,hash]);
        await client.query('COMMIT');
        return {share,pin};
      } catch(error) {await client.query('ROLLBACK');throw error;}
      finally {client.release();}
    },
    async unlock(share,pin,source) {
      if(!validSecret(share) || typeof pin!=='string' || (pin!==''&&!/^\d{8}$/.test(pin)) || typeof source!=='string' || !source) return null;
      const policy=await store.pool.query('SELECT g.binding FROM pin_shares p JOIN grants g ON g.id=p.grant_id WHERE p.share_hash=$1 AND p.generation=g.generation AND g.revoked_at IS NULL AND g.expires_at>now()',[digest(share)]);
      const optional=policy.rows[0]?.binding.pinRequired===false;
      if(pin===''&&!optional)return null;
      // Reserve attempts atomically BEFORE expensive hashing, across all replicas.
      // Count attempts (including success), conservatively bounding hash work.
      // Expired windows reset; rejected requests never extend the window.
      const reserve=async(bucket,limit)=>{
        const {rows}=await store.pool.query(`INSERT INTO pin_attempts(bucket,attempts,resets_at)
          VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE
          SET attempts=CASE WHEN pin_attempts.resets_at<=now() THEN 1 ELSE pin_attempts.attempts+1 END,
          resets_at=CASE WHEN pin_attempts.resets_at<=now() THEN now()+interval '15 minutes' ELSE pin_attempts.resets_at END
          WHERE pin_attempts.resets_at<=now() OR pin_attempts.attempts<$2 RETURNING attempts`,[bucket,limit]);
        return rows.length===1;
      };
      if(!await reserve('source:'+digest(source),30))return null;
      if(!await reserve('share:'+digest(share),optional?30:5))return null;
      const {rows}=await store.pool.query('SELECT * FROM pin_shares WHERE share_hash=$1',[digest(share)]);
      const row=rows[0];
      const hash=optional?null:await derive(pin,row?.salt || Buffer.alloc(16));
      if(!row || (!optional&&!timingSafeEqual(hash,row.pin_hash)))return null;
      const client=await store.pool.connect();
      try {
        await client.query('BEGIN');
        // Lock the parent before inspecting the share to serialize rotation,
        // revocation and handoff issuance with the same lock order.
        const grant=await client.query('SELECT generation,binding FROM grants WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[row.grant_id]);
        const current=await client.query('SELECT generation FROM pin_shares WHERE share_hash=$1 AND grant_id=$2',[digest(share),row.grant_id]);
        if(!grant.rows[0] || (optional&&grant.rows[0].binding.pinRequired!==false) || current.rows[0]?.generation!==grant.rows[0].generation || row.generation!==grant.rows[0].generation) {
          await client.query('ROLLBACK');return null;
        }
        const handoff=secret();
        await client.query(`INSERT INTO handoffs(token_hash,grant_id,generation,expires_at)
          VALUES($1,$2,$3,now()+interval '60 seconds')`,[digest(handoff),row.grant_id,row.generation]);
        await client.query('COMMIT');return handoff;
      } catch(error) {await client.query('ROLLBACK');throw error;}
      finally {client.release();}
    },
  };
}
