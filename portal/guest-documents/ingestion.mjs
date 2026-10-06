import {active,clientActive} from './catalog/scope.mjs';
import {randomUUID} from 'node:crypto';
import {hash} from './workflow.mjs';
export const maxPdfBytes=3*1024*1024;
const deny=()=>{throw Error('Document upload unavailable');};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
// Authenticated uploads use bounded PDF type/header checks and private byte-integrity verification.
export function documentIngestion({pool,storage}) {
 if(!pool?.connect||!['upload','download'].every(k=>typeof storage?.[k]==='function'))throw Error('Upload dependencies required');
 async function scoped(db,actor,org,document,lock=false){
  const {rows}=await db.query(`SELECT d.* FROM gc_atrium.guest_document d
   JOIN gc_atrium.project p ON p.id=d.project_id AND p."organizationId"=d.organization_id
   JOIN gc_atrium.member m ON m."organizationId"=d.organization_id AND m."userId"=$1
   JOIN gc_atrium."user" u ON u.id=m."userId"
   WHERE d.id=$2 AND d.organization_id=$3 AND p."archivedAt" IS NULL AND ${active('d','documents')} AND ${clientActive('d')} AND u."emailVerified" AND m.role IN ('owner','admin')
   ${lock?'FOR UPDATE OF d FOR SHARE OF p,m,u':''}`,[actor,document,org]);
  if(rows.length!==1)deny();return rows[0];
 }
 return {upload:async(actor,org,{documentId,title,contentType,bytes})=>{
  if(!uuid(documentId)||typeof title!=='string'||title!==title.trim()||!title.length||title.length>200||/[\x00-\x1f\x7f]/.test(title)||contentType!=='application/pdf'||!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>maxPdfBytes||!/^%PDF-(1\.[0-7]|2\.0)/.test(bytes.subarray(0,8).toString('ascii')))deny();
  // Copy once: caller mutation cannot change the bytes between hash and storage.
  const original=Buffer.from(bytes),sha256=hash(original);
  const initial=await scoped(pool,actor,org,documentId);
  const key=`guest-documents/${randomUUID()}.pdf`;
  await storage.upload(key,original,'application/pdf');
  const stored=await storage.download(key);
  if(!Buffer.isBuffer(stored.bytes)||hash(stored.bytes)!==sha256||stored.contentType!=='application/pdf')deny();
  const db=await pool.connect();
  try {
   await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['guest-catalog:'+org]);const d=await scoped(db,actor,org,documentId,true);
   if(d.project_id!==initial.project_id)deny();
   const id=randomUUID(),version=(await db.query('SELECT coalesce(max(version),0)+1 AS n FROM gc_atrium.guest_version WHERE document_id=$1',[documentId])).rows[0].n;
   await db.query(`INSERT INTO gc_atrium.guest_artifact(storage_key,organization_id,project_id,document_id,sha256,byte_length,policy,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[key,org,d.project_id,documentId,sha256,original.length,'gc-pdf-upload-v1',actor]);
   await db.query(`INSERT INTO gc_atrium.guest_version(id,document_id,client_id,organization_id,version,title,artifact_key,artifact_sha256,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,documentId,d.client_id,org,version,title,key,sha256,actor]);
   await db.query("INSERT INTO gc_atrium.guest_audit(id,organization_id,actor_id,subject_id,action) VALUES($1,$2,$3,$4,'version_created')",[randomUUID(),org,actor,id]);
   await db.query('COMMIT');return {id,version};
  } catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  // Never delete automatically after an uncertain commit: it could remove a committed version.
  // Unregistered private objects are inaccessible and require a later orphan reconciliation job.
 }};
}

export function registeredArtifacts({pool,storage}){
 if(!pool?.query||typeof storage?.download!=='function')throw Error('Registered artifact dependencies required');
 const read=async({organizationId,projectId,key,sha256,documentId})=>{
  const allowed=async()=>{
   const {rows}=await pool.query(`SELECT a.byte_length FROM gc_atrium.guest_artifact a
    JOIN gc_atrium.guest_document d ON d.id=a.document_id AND d.organization_id=a.organization_id AND d.project_id=a.project_id
    JOIN gc_atrium.project p ON p.id=a.project_id AND p."organizationId"=a.organization_id
    WHERE a.storage_key=$1 AND a.sha256=$2 AND a.organization_id=$3 AND a.project_id=$4 AND a.policy='gc-pdf-upload-v1' AND p."archivedAt" IS NULL AND ${active('d','documents')} AND ${clientActive('d')} AND ($5::uuid IS NULL OR a.document_id=$5::uuid)`,[key,sha256,organizationId,projectId,documentId??null]);
   if(rows.length!==1)deny();return rows[0].byte_length;
  };
  const size=await allowed(),result=await storage.download(key);
  if(!Buffer.isBuffer(result.bytes)||result.bytes.length!==size||size>maxPdfBytes||result.contentType!=='application/pdf'||hash(result.bytes)!==sha256)deny();
  await allowed();return result.bytes;
 };
 return {read,verify:async binding=>{try{await read(binding);return true;}catch{return false;}}};
}
