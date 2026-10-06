import {catalogManagement,recipientRecord} from './catalog/manage.mjs';
import {active,clientActive,label} from './catalog/scope.mjs';
import {isDeepStrictEqual} from 'node:util';
import {signingFields,fieldsHash} from './signing/fields.mjs';
import {messagePreview} from "./message.mjs";
import {createHash,randomUUID} from 'node:crypto';
export const hash=value=>createHash('sha256').update(value).digest('hex');
const unavailable=()=>{throw new Error('Document workflow unavailable');};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const text=(x,max=200)=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=max&&!/[\x00-\x1f]/.test(x);
// Actor identity is supplied by the authenticated server adapter, never from an HTTP body.
// This module has no email, account creation, public routes or signing-provider effects.
export function workflow(pool,{verifyArtifact}={}) {
 if(!pool?.connect || typeof verifyArtifact!=='function')throw Error('Required workflow configuration missing');
 async function transaction(actor,organization,fn){
  if(!text(actor)||!text(organization))unavailable();
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['guest-catalog:'+organization]);
   const r=await db.query(`SELECT m.id FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId"
    WHERE m."organizationId"=$1 AND m."userId"=$2 AND m.role IN ('owner','admin') AND u."emailVerified" FOR SHARE OF m,u`,[organization,actor]);
   if(!r.rowCount)unavailable();
   const result=await fn(db);await db.query('COMMIT');return result;
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 const audit=(db,org,actor,id,action)=>db.query('INSERT INTO gc_atrium.guest_audit(id,organization_id,actor_id,subject_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),org,actor,id,action]);
 async function snapshot(db,org,version,recipient,fields,requirePin=true){
  if(!uuid(version)||!uuid(recipient))unavailable();
  const {rows}=await db.query(`SELECT v.id AS version_id,v.document_id,v.client_id,v.organization_id,v.version,v.title,v.artifact_key,v.artifact_sha256,
    r.id AS recipient_id,r.email AS recipient_email,d.kind,d.project_id FROM gc_atrium.guest_version v
    JOIN gc_atrium.guest_recipient r ON r.client_id=v.client_id AND r.organization_id=v.organization_id
    JOIN gc_atrium.guest_document d ON d.id=v.document_id JOIN gc_atrium.project p ON p.id=d.project_id
    WHERE v.id=$1 AND r.id=$2 AND v.organization_id=$3 AND p."organizationId"=$3 AND p."archivedAt" IS NULL AND ${active('d','documents')} AND ${active('r','recipients')} AND ${clientActive('d')}`,[version,recipient,org]);
  if(!rows[0])unavailable();
  const message=messagePreview({...rows[0],requirePin});
  if(fields!==undefined){const layout=signingFields(fields,1000);message.signing={revision:'gc-signing-fields-v1',fields:layout,sha256:fieldsHash(layout)};}
  return {...rows[0],message};
 }
 const previewHash=s=>hash(JSON.stringify([s.organization_id,s.client_id,s.project_id,s.document_id,s.kind,s.version_id,s.version,s.title,s.artifact_key,s.artifact_sha256,s.recipient_id,s.recipient_email,s.message]));
 return {
  ...catalogManagement({transaction,verifyArtifact}),
  catalog:(actor,org,options={})=>transaction(actor,org,async db=>{
   if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['collection','limit','after'].includes(k)))unavailable();
   const {collection,limit=100,after}=options;
   const queries={
    clients:{sql:`SELECT c.id,${label('c','clients','c.name')} AS name FROM gc_atrium.guest_client c WHERE c.organization_id=$1 AND ${active('c','clients')}`,id:'c.id',type:'uuid'},
    recipients:{sql:`SELECT r.id,r.client_id,r.email FROM gc_atrium.guest_recipient r WHERE r.organization_id=$1 AND ${active('r','recipients')} AND ${clientActive('r')}`,id:'r.id',type:'uuid'},
    projects:{sql:'SELECT id,name FROM gc_atrium.project WHERE "organizationId"=$1 AND "archivedAt" IS NULL',id:'id COLLATE "C"',type:'text'},
    documents:{sql:`SELECT d.id,d.client_id,d.project_id,d.kind,v.id AS version_id,v.version,coalesce(v.title,${label('d','documents','NULL')}) AS title FROM gc_atrium.guest_document d
     JOIN gc_atrium.project p ON p.id=d.project_id AND p."organizationId"=d.organization_id AND p."archivedAt" IS NULL
     LEFT JOIN LATERAL (SELECT id,version,title FROM gc_atrium.guest_version WHERE document_id=d.id ORDER BY version DESC LIMIT 1) v ON true
     WHERE d.organization_id=$1 AND ${active('d','documents')} AND ${clientActive('d')}`,id:'d.id',type:'uuid'}
   };
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||collection!==undefined&&!Object.hasOwn(queries,collection)||after!==undefined&&collection===undefined)unavailable();
   const selected=collection===undefined?Object.keys(queries):[collection],result={};
   for(const key of selected){
    const q=queries[key];
    if(after!==undefined&&!(q.type==='uuid'?uuid(after):text(after)))unavailable();
    const {rows}=await db.query(`${q.sql} AND ($2::${q.type} IS NULL OR ${q.id}>$2::${q.type}) ORDER BY ${q.id} LIMIT $3`,[org,after??null,limit+1]);
    const items=rows.slice(0,limit),truncated=rows.length>limit;
    result[key]={items,truncated,nextCursor:truncated?items.at(-1).id:null};
   }
   return result;
  }),
  artifact:(actor,org,version)=>transaction(actor,org,async db=>{
   if(!uuid(version))unavailable();
   const {rows}=await db.query(`SELECT v.id,v.document_id,v.title,v.artifact_key,v.artifact_sha256,d.project_id FROM gc_atrium.guest_version v
    JOIN gc_atrium.guest_document d ON d.id=v.document_id JOIN gc_atrium.project p ON p.id=d.project_id
    WHERE v.id=$1 AND v.organization_id=$2 AND d.organization_id=$2 AND p."organizationId"=$2 AND p."archivedAt" IS NULL AND ${active('d','documents')} AND ${clientActive('d')}`,[version,org]);
   if(rows.length!==1)unavailable();return rows[0];
  }),
  createClient:(actor,org,name)=>transaction(actor,org,async db=>{
   if(!text(name))unavailable();const id=randomUUID();await db.query('INSERT INTO gc_atrium.guest_client VALUES($1,$2,$3)',[id,org,name]);return id;
  }),
  createRecipient:(actor,org,client,email)=>transaction(actor,org,async db=>{
   if(!uuid(client)||!text(email,254)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))unavailable();
   if(!(await db.query(`SELECT c.id FROM gc_atrium.guest_client c WHERE c.id=$1 AND c.organization_id=$2 AND ${active('c','clients')}`,[client,org])).rowCount)unavailable();
   return recipientRecord(db,actor,org,client,email.toLowerCase());
  }),
  createDocument:(actor,org,client,project,kind)=>transaction(actor,org,async db=>{
   if(!uuid(client)||!text(project)||!['proposal','contract','nda','supporting'].includes(kind))unavailable();
   if(!(await db.query(`SELECT c.id FROM gc_atrium.guest_client c WHERE c.id=$1 AND c.organization_id=$2 AND ${active('c','clients')}`,[client,org])).rowCount)unavailable();
   const id=randomUUID();await db.query('INSERT INTO gc_atrium.guest_document VALUES($1,$2,$3,$4,$5)',[id,client,org,project,kind]);return id;
  }),
  createVersion:(actor,org,document,{title,artifactKey,artifactSha256})=>transaction(actor,org,async db=>{
   if(!uuid(document)||!text(title)||!text(artifactKey,512)||!/^[a-f0-9]{64}$/.test(artifactSha256))unavailable();
   const {rows}=await db.query(`SELECT d.* FROM gc_atrium.guest_document d WHERE d.id=$1 AND d.organization_id=$2 AND ${active('d','documents')} AND ${clientActive('d')} FOR UPDATE`,[document,org]);if(!rows[0])unavailable();
   const d=rows[0];if(await verifyArtifact({organizationId:org,projectId:d.project_id,documentId:document,key:artifactKey,sha256:artifactSha256})!==true)unavailable();
   const n=(await db.query('SELECT coalesce(max(version),0)+1 AS n FROM gc_atrium.guest_version WHERE document_id=$1',[document])).rows[0].n;
   const id=randomUUID();await db.query('INSERT INTO gc_atrium.guest_version(id,document_id,client_id,organization_id,version,title,artifact_key,artifact_sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,document,d.client_id,org,n,title,artifactKey,artifactSha256,actor]);
   await audit(db,org,actor,id,'version_created');return {id,version:n};
  }),
  savedFields:(actor,org,version,recipient)=>transaction(actor,org,async db=>{
   await snapshot(db,org,version,recipient);
   const {rows}=await db.query('SELECT id,expires_at,message_snapshot FROM gc_atrium.guest_approval WHERE version_id=$1 AND recipient_id=$2 AND organization_id=$3 ORDER BY approved_at DESC,id DESC LIMIT 1',[version,recipient,org]);
   return {fields:rows[0]?.message_snapshot.signing?.fields??[],approvalId:rows[0]?.id??null,requirePin:rows[0]?.message_snapshot.policy.pinDelivery!=='none'};
  }),
  preview:(actor,org,version,recipient,fields,requirePin=true)=>transaction(actor,org,async db=>{const s=await snapshot(db,org,version,recipient,fields,requirePin);return {...s,previewSha256:previewHash(s)};}),
  approve:(actor,org,{version,recipient,previewSha256,expiresAt,fields,requirePin=true})=>transaction(actor,org,async db=>{
   const s=await snapshot(db,org,version,recipient,fields,requirePin);if(previewSha256!==previewHash(s))unavailable();
   if(await verifyArtifact({organizationId:org,projectId:s.project_id,documentId:s.document_id,key:s.artifact_key,sha256:s.artifact_sha256})!==true)unavailable();
   const id=randomUUID();await db.query('INSERT INTO gc_atrium.guest_approval(id,version_id,recipient_id,client_id,organization_id,approved_by,recipient_email,preview_sha256,expires_at,message_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,version,recipient,s.client_id,org,actor,s.recipient_email,previewSha256,expiresAt,JSON.stringify(s.message)]);
   await audit(db,org,actor,id,'approved');return id;
  }),
  signingSource:(actor,org,approval)=>transaction(actor,org,async db=>{
   if(!uuid(approval))unavailable();
   const {rows}=await db.query('SELECT * FROM gc_atrium.guest_approval WHERE id=$1 AND organization_id=$2 AND expires_at>clock_timestamp()',[approval,org]);
   const a=rows[0];if(!a?.message_snapshot.signing)unavailable();
   const s=await snapshot(db,org,a.version_id,a.recipient_id,a.message_snapshot.signing.fields,a.message_snapshot.policy.pinDelivery!=='none');
   if(previewHash(s)!==a.preview_sha256||!isDeepStrictEqual(a.message_snapshot,s.message))unavailable();
   if(await verifyArtifact({organizationId:org,projectId:s.project_id,documentId:s.document_id,key:s.artifact_key,sha256:s.artifact_sha256})!==true)unavailable();
   return {...s,approvalId:a.id,expiresAt:a.expires_at,versionId:s.version_id,recipientEmail:s.recipient_email,
    artifactSha256:s.artifact_sha256,fields:s.message.signing.fields,fieldsSha256:s.message.signing.sha256};
  }),
  prepareDispatch:(actor,org,approval)=>transaction(actor,org,async db=>{
   if(!uuid(approval))unavailable();
   const {rows}=await db.query('SELECT * FROM gc_atrium.guest_approval WHERE id=$1 AND organization_id=$2 AND expires_at>now() FOR UPDATE',[approval,org]);if(!rows[0])unavailable();
   const a=rows[0],s=await snapshot(db,org,a.version_id,a.recipient_id,a.message_snapshot.signing?.fields,a.message_snapshot.policy.pinDelivery!=='none');if(previewHash(s)!==a.preview_sha256||!isDeepStrictEqual(a.message_snapshot,s.message))unavailable();
   if(await verifyArtifact({organizationId:org,projectId:s.project_id,documentId:s.document_id,key:s.artifact_key,sha256:s.artifact_sha256})!==true)unavailable();
   const id=randomUUID();await db.query('INSERT INTO gc_atrium.guest_dispatch(id,approval_id) VALUES($1,$2) ON CONFLICT(approval_id) DO NOTHING',[id,approval]);
   const d=(await db.query('SELECT * FROM gc_atrium.guest_dispatch WHERE approval_id=$1',[approval])).rows[0];if(d.status!=='prepared')unavailable();
   if(d.id===id)await audit(db,org,actor,id,'dispatch_prepared');return {id:d.id,status:d.status};
  }),
  revoke:(actor,org,id)=>transaction(actor,org,async db=>{
   if(!uuid(id))unavailable();const r=await db.query(`UPDATE gc_atrium.guest_dispatch d SET status='revoked',generation=d.generation+1,revoked_at=now()
    FROM gc_atrium.guest_approval a WHERE d.id=$1 AND d.approval_id=a.id AND a.organization_id=$2 AND d.status='prepared' RETURNING d.id`,[id,org]);
   if(!r.rowCount)unavailable();await audit(db,org,actor,id,'revoked');return {revoked:true};
  })
 };
}
