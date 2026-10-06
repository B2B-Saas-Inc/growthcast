import {argon2,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {hash} from './workflow.mjs';
const secret=()=>randomBytes(32).toString('base64url');
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{43}$/.test(x);
const derive=(pin,salt)=>promisify(argon2)('argon2id',{message:pin,nonce:salt,parallelism:1,memory:65536,passes:3,tagLength:32});
const scope=`SELECT d.id,a.expires_at,v.id AS version_id,v.document_id,v.title,v.artifact_key,v.artifact_sha256,a.recipient_id,
 a.organization_id,p.id AS project_id FROM gc_atrium.guest_dispatch d
 JOIN gc_atrium.guest_approval a ON a.id=d.approval_id JOIN gc_atrium.guest_version v ON v.id=a.version_id
 JOIN gc_atrium.guest_document doc ON doc.id=v.document_id JOIN gc_atrium.project p ON p.id=doc.project_id
 WHERE d.id=$1 AND d.status='prepared' AND a.expires_at>clock_timestamp() AND p."organizationId"=a.organization_id AND p."archivedAt" IS NULL`;
export function access(pool){
 if(!pool?.connect || typeof argon2!=='function')throw Error('Access store and Argon2-capable Node runtime required');
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 const audit=(db,id,action,actor=null)=>db.query('INSERT INTO gc_atrium.guest_access_audit VALUES($1,$2,$3,now(),$4)',[randomUUID(),id,action,actor]);
 async function reserve(bucket,limit){const {rowCount}=await pool.query(`INSERT INTO gc_atrium.guest_attempt VALUES($1,1,now()+interval '15 minutes')
 ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN guest_attempt.resets_at<=now() THEN 1 ELSE guest_attempt.attempts+1 END,
 resets_at=CASE WHEN guest_attempt.resets_at<=now() THEN now()+interval '15 minutes' ELSE guest_attempt.resets_at END
 WHERE guest_attempt.resets_at<=now() OR guest_attempt.attempts<$2 RETURNING attempts`,[bucket,limit]);return rowCount===1;}
 return {
  // Authenticated server adapter supplies actor/organization. Never accept them from an untrusted guest body.
  issue:async(actor,organization,id)=>tx(async db=>{
   const staff=await db.query(`SELECT m.id FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId"
    WHERE m."userId"=$1 AND m."organizationId"=$2 AND m.role IN ('owner','admin') AND u."emailVerified" FOR SHARE OF m,u`,[actor,organization]);
   if(!staff.rowCount)throw Error('Access unavailable');
   const {rows}=await db.query(scope+' FOR UPDATE OF d',[id]);if(rows[0]?.organization_id!==organization)throw Error('Access unavailable');
   const pin=String(randomInt(100000000)).padStart(8,'0'),share=secret(),salt=randomBytes(16),pinHash=await derive(pin,salt);
   const result=await db.query(`INSERT INTO gc_atrium.guest_access(dispatch_id,share_hash,salt,pin_hash) VALUES($1,$2,$3,$4)
    ON CONFLICT(dispatch_id) DO UPDATE SET share_hash=EXCLUDED.share_hash,salt=EXCLUDED.salt,pin_hash=EXCLUDED.pin_hash,generation=guest_access.generation+1 RETURNING generation`,[id,hash(share),salt,pinHash]);
   await audit(db,id,result.rows[0].generation===0?'pin_issued':'pin_rotated',actor);return {share,pin};
  }),
  unlock:async(share,pin,source)=>{
   if(!token(share)||typeof pin!=='string'||!/^\d{8}$/.test(pin)||typeof source!=='string'||!source||source.length>200)return null;
   // Source must come from the trusted HTTP adapter, never a client-selected forwarding header.
   if(!await reserve('source:'+hash(source),30)||!await reserve('share:'+hash(share),5))return null;
   const found=(await pool.query('SELECT * FROM gc_atrium.guest_access WHERE share_hash=$1',[hash(share)])).rows[0];
   const derived=await derive(pin,found?.salt??Buffer.alloc(16));if(!found||!timingSafeEqual(derived,found.pin_hash))return null;
   return tx(async db=>{
    const bound=(await db.query(scope+' FOR UPDATE OF d',[found.dispatch_id])).rows[0];if(!bound)return null;
    const fresh=(await db.query('SELECT generation FROM gc_atrium.guest_access WHERE dispatch_id=$1 AND share_hash=$2',[found.dispatch_id,hash(share)])).rows[0];
    if(!fresh||fresh.generation!==found.generation)return null;
    const session=secret(),csrf=secret();await db.query(`INSERT INTO gc_atrium.guest_session VALUES($1,$2,$3,$4,LEAST($5::timestamptz,clock_timestamp()+interval '1 hour'))`,[hash(session),found.dispatch_id,found.generation,hash(csrf),bound.expires_at]);
    await audit(db,found.dispatch_id,'unlocked');return {session,csrf};
   });
  },
  authorize:async(session)=>{
   if(!token(session))return null;
   const scoped=scope.replace('d.id=$1',"d.id IN (SELECT dispatch_id FROM gc_atrium.guest_session WHERE token_hash=$1)");
   const {rows}=await pool.query(`SELECT bound.*,s.csrf_hash AS "csrfHash" FROM (${scoped}) bound
    JOIN gc_atrium.guest_access a ON a.dispatch_id=bound.id JOIN gc_atrium.guest_session s ON s.dispatch_id=a.dispatch_id AND s.generation=a.generation
    WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()`,[hash(session)]);return rows[0]??null;
  },
  logout:async(session,csrf)=>{
   if(!token(session)||!token(csrf))return false;
   return tx(async db=>{const {rows}=await db.query('DELETE FROM gc_atrium.guest_session WHERE token_hash=$1 AND csrf_hash=$2 RETURNING dispatch_id',[hash(session),hash(csrf)]);if(!rows[0])return false;await audit(db,rows[0].dispatch_id,'logout');return true;});
  }
 };
}
