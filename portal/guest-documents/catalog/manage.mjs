import {randomUUID} from 'node:crypto';
import {active,clientActive,label} from './scope.mjs';
const fail=()=>{throw Error('Catalog change unavailable');};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text=(v,max=200)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
export async function recipientRecord(db,actor,org,client,email){
 const old=(await db.query("SELECT r.id,s.deleted_at FROM gc_atrium.guest_recipient r LEFT JOIN gc_atrium.guest_catalog_state s ON s.entity='recipients' AND s.id=r.id WHERE r.client_id=$1 AND r.organization_id=$2 AND r.email=$3",[client,org,email])).rows[0];
 if(old){if(!old.deleted_at)fail();await db.query("UPDATE gc_atrium.guest_catalog_state SET deleted_at=NULL,updated_by=$2 WHERE entity='recipients' AND id=$1",[old.id,actor]);return old.id;}
 const id=randomUUID();await db.query('INSERT INTO gc_atrium.guest_recipient(id,client_id,organization_id,email) VALUES($1,$2,$3,$4)',[id,client,org,email]);return id;
}
export function catalogManagement({transaction,verifyArtifact}){
 const queries={
  clients:`SELECT c.id,${label('c','clients','c.name')} AS name FROM gc_atrium.guest_client c WHERE c.organization_id=$1 AND c.id=$2 AND ${active('c','clients')}`,
  recipients:`SELECT r.id,r.client_id,r.email,${label('c','clients','c.name')} AS client_name FROM gc_atrium.guest_recipient r JOIN gc_atrium.guest_client c ON c.id=r.client_id WHERE r.organization_id=$1 AND r.id=$2 AND ${active('r','recipients')} AND ${clientActive('r')}`,
  documents:`SELECT d.id,d.client_id,d.project_id,d.kind,${label('c','clients','c.name')} AS client_name,p.name AS project_name,v.id AS version_id,v.version,coalesce(v.title,${label('d','documents','NULL')}) AS title,v.artifact_key,v.artifact_sha256 FROM gc_atrium.guest_document d JOIN gc_atrium.guest_client c ON c.id=d.client_id JOIN gc_atrium.project p ON p.id=d.project_id AND p."organizationId"=d.organization_id AND p."archivedAt" IS NULL LEFT JOIN LATERAL (SELECT * FROM gc_atrium.guest_version WHERE document_id=d.id ORDER BY version DESC LIMIT 1) v ON true WHERE d.organization_id=$1 AND d.id=$2 AND ${active('d','documents')} AND ${clientActive('d')}`
 };
 async function read(db,org,entity,id){if(!Object.hasOwn(queries,entity)||!uuid(id))fail();const {rows}=await db.query(queries[entity],[org,id]);if(!rows[0])fail();return rows[0];}
 async function state(db,actor,org,entity,id,label,remove=false){await db.query(`INSERT INTO gc_atrium.guest_catalog_state(entity,id,organization_id,label,deleted_at,updated_by) VALUES($1,$2,$3,$4,CASE WHEN $5 THEN clock_timestamp() ELSE NULL END,$6) ON CONFLICT(entity,id) DO UPDATE SET label=coalesce(EXCLUDED.label,guest_catalog_state.label),deleted_at=EXCLUDED.deleted_at,updated_by=EXCLUDED.updated_by`,[entity,id,org,label,remove,actor]);}
 return {
  record:(actor,org,entity,id)=>transaction(actor,org,async db=>{const row=await read(db,org,entity,id);delete row.artifact_key;delete row.artifact_sha256;return row;}),
  editRecord:(actor,org,{entity,id,value})=>transaction(actor,org,async db=>{
   const row=await read(db,org,entity,id);if(!text(value,entity==='recipients'?254:200))fail();
   if(entity==='recipients'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail();value=value.toLowerCase();if(value===row.email)return {id};
    const replacement=await recipientRecord(db,actor,org,row.client_id,value);
    await state(db,actor,org,entity,id,null,true);return {id:replacement};
   }
   if(entity==='documents'&&row.version_id&&value!==row.title){
    if(!await verifyArtifact({organizationId:org,projectId:row.project_id,documentId:id,key:row.artifact_key,sha256:row.artifact_sha256}))fail();
    await db.query('SELECT id FROM gc_atrium.guest_document WHERE id=$1 FOR UPDATE',[id]);
    const versionId=randomUUID();await db.query(`INSERT INTO gc_atrium.guest_version(id,document_id,client_id,organization_id,version,title,artifact_key,artifact_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[versionId,id,row.client_id,org,row.version+1,value,row.artifact_key,row.artifact_sha256,actor]);
    await db.query("INSERT INTO gc_atrium.guest_audit(id,organization_id,actor_id,subject_id,action) VALUES($1,$2,$3,$4,'version_created')",[randomUUID(),org,actor,versionId]);
   }
   await state(db,actor,org,entity,id,value);return {id};
  }),
  deleteRecord:(actor,org,{entity,id})=>transaction(actor,org,async db=>{await read(db,org,entity,id);await state(db,actor,org,entity,id,null,true);return {deleted:true};})
 };
}
