import {randomUUID} from 'node:crypto';
import {hash} from '../workflow.mjs';
import {signingFields} from './fields.mjs';
import {deliveryMessages} from './mail.mjs';
const unavailable=()=>{throw Error('Document send unavailable');};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const uncertain=new Set(['creating','configuring','activating','grant_creating','link_sending','pin_sending']);
const terminal=new Set(['sent','needs_review','revoked']);
const publicState=row=>({id:row.id,approvalId:row.approval_id,status:row.dispatch_status==='revoked'?'revoked':row.completed_document_id?'completed':row.status,failureCode:row.failure_code??null});
export function documentDelivery({pool,flow,provider,readArtifact,countPages,gateway,mailer,secrets,signingOrigin}){
 if(!pool?.connect||!flow?.signingSource||!provider?.createDraft||typeof readArtifact!=='function'||typeof countPages!=='function'||!gateway?.provision||!mailer?.send||!secrets?.seal||!secrets?.open||!signingOrigin?.startsWith('https://')||new URL(signingOrigin).origin!==signingOrigin)throw Error('Explicit document delivery dependencies required');
 async function tx(fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 const event=(db,id,status)=>db.query('INSERT INTO gc_atrium.guest_send_event(id,send_id,status) VALUES($1,$2,$3)',[randomUUID(),id,status]);
 async function staff(db,actor,org){const {rowCount}=await db.query(`SELECT m.id FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId" WHERE m."userId"=$1 AND m."organizationId"=$2 AND m.role IN ('owner','admin') AND u."emailVerified" FOR SHARE OF m,u`,[actor,org]);if(!rowCount)unavailable();}
 async function current(job){
  const {rowCount}=await pool.query(`SELECT s.id FROM gc_atrium.guest_send s JOIN gc_atrium.guest_dispatch d ON d.id=s.dispatch_id WHERE s.id=$1 AND s.lease_id=$2 AND s.lease_until>clock_timestamp() AND s.status=$3 AND d.status='prepared'`,[job.id,job.lease_id,job.status]);
  if(!rowCount)unavailable();return flow.signingSource(job.requested_by,job.organization_id,job.approval_id);
 }
 async function advance(job,status,patch={}){
  return tx(async db=>{
   const {rows}=await db.query(`UPDATE gc_atrium.guest_send SET status=$4,envelope_id=coalesce($5,envelope_id),binding_ciphertext=coalesce($6,binding_ciphertext),access_ciphertext=coalesce($7,access_ciphertext),failure_code=$8,updated_at=clock_timestamp(),
    lease_id=CASE WHEN $9 THEN NULL ELSE lease_id END,lease_until=CASE WHEN $9 THEN NULL ELSE lease_until END
    WHERE id=$1 AND lease_id=$2 AND status=$3 AND lease_until>clock_timestamp() RETURNING *`,[job.id,job.lease_id,job.status,status,patch.envelopeId??null,patch.binding??null,patch.access??null,patch.failureCode??null,terminal.has(status)]);
   if(!rows[0])unavailable();await event(db,job.id,status);return rows[0];
  });
 }
 return {
  async request(actor,org,approval){
   if(!uuid(approval))unavailable();
   const source=await flow.signingSource(actor,org,approval);
   const dispatch=await flow.prepareDispatch(actor,org,approval);
   return tx(async db=>{
    await staff(db,actor,org);
    const active=await db.query("SELECT id FROM gc_atrium.guest_dispatch WHERE id=$1 AND status='prepared' FOR UPDATE",[dispatch.id]);if(!active.rowCount)unavailable();
    const id=randomUUID(),insert=await db.query(`INSERT INTO gc_atrium.guest_send(id,dispatch_id,approval_id,version_id,recipient_id,organization_id,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING *`,[id,dispatch.id,approval,source.version_id,source.recipient_id,org,actor]);
    const row=insert.rows[0]??(await db.query('SELECT * FROM gc_atrium.guest_send WHERE version_id=$1 AND recipient_id=$2 AND organization_id=$3',[source.version_id,source.recipient_id,org])).rows[0];
    if(!row||row.approval_id!==approval)unavailable();if(insert.rowCount)await event(db,id,'queued');return publicState(row);
   });
  },
  async status(actor,org,id){
   if(!uuid(id))unavailable();return tx(async db=>{await staff(db,actor,org);const {rows}=await db.query('SELECT s.*,d.status AS dispatch_status,c.document_id AS completed_document_id FROM gc_atrium.guest_send s JOIN gc_atrium.guest_dispatch d ON d.id=s.dispatch_id LEFT JOIN gc_atrium.guest_completed c ON c.send_id=s.id WHERE s.id=$1 AND s.organization_id=$2',[id,org]);if(!rows[0])unavailable();return publicState(rows[0]);});
  },
  async statusForApproval(actor,org,approval){
   if(!uuid(approval))unavailable();return tx(async db=>{await staff(db,actor,org);const {rows}=await db.query('SELECT s.*,d.status AS dispatch_status,c.document_id AS completed_document_id FROM gc_atrium.guest_send s JOIN gc_atrium.guest_dispatch d ON d.id=s.dispatch_id LEFT JOIN gc_atrium.guest_completed c ON c.send_id=s.id WHERE s.approval_id=$1 AND s.organization_id=$2',[approval,org]);return rows[0]?publicState(rows[0]):null;});
  },
  async runOnce(){
   let job=await tx(async db=>{
    const {rows}=await db.query(`SELECT * FROM gc_atrium.guest_send WHERE status NOT IN ('sent','needs_review','revoked') AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
    if(!rows[0])return null;const row=rows[0];
    if(uncertain.has(row.status)){await db.query("UPDATE gc_atrium.guest_send SET status='needs_review',failure_code='interrupted',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",[row.id]);await event(db,row.id,'needs_review');return null;}
    return (await db.query("UPDATE gc_atrium.guest_send SET lease_id=$2,lease_until=clock_timestamp()+interval '3 minutes' WHERE id=$1 RETURNING *",[row.id,randomUUID()])).rows[0];
   });
   if(!job)return {processed:false};
   let failureCode='approval_unavailable';
   try{
    let source=await current(job);
    const bytes=await readArtifact({organizationId:source.organization_id,projectId:source.project_id,documentId:source.document_id,key:source.artifact_key,sha256:source.artifact_sha256});
    if(!Buffer.isBuffer(bytes)||bytes.length>3*1024*1024||hash(bytes)!==source.artifactSha256)unavailable();
    const pageCount=await countPages(bytes);signingFields(source.fields,pageCount);source={...source,pageCount};
    if(provider.prepareSource)source=await provider.prepareSource(source,bytes);
    if(job.status==='queued'){
     await current(job);job=await advance(job,'creating');failureCode='provider_unavailable';
     const draft=await provider.createDraft(source,bytes);job=await advance(job,'created',{envelopeId:draft.envelopeId});
    }
    if(job.status==='created'){
     await current(job);job=await advance(job,'configuring');failureCode='provider_unavailable';
     if(provider.configureDraft)await provider.configureDraft(job.envelope_id,source);
     job=await advance(job,'configured');
    }
    if(job.status==='configured'){
     await current(job);failureCode='provider_unavailable';await provider.inspectDraft(job.envelope_id,source);job=await advance(job,'activating');failureCode='provider_unavailable';
     const binding=await provider.activate(job.envelope_id,source);job=await advance(job,'active',{binding:secrets.seal(job.id,binding)});
    }
    if(job.status==='active'){
     await current(job);job=await advance(job,'grant_creating');failureCode='access_unavailable';
     const access=await gateway.provision({id:job.id,dispatchId:job.dispatch_id,source,binding:secrets.open(job.id,job.binding_ciphertext)});
     deliveryMessages(source,access,signingOrigin,job.id);job=await advance(job,'ready',{access:secrets.seal(job.id,access)});
    }
    const messages=deliveryMessages(source,secrets.open(job.id,job.access_ciphertext),signingOrigin,job.id);
    if(job.status==='ready'){
     await current(job);job=await advance(job,'link_sending');failureCode='mail_uncertain';
     if((await mailer.send(messages.document))?.accepted!==true)unavailable();job=await advance(job,'link_sent');
    }
    if(job.status==='link_sent'){
     await current(job);job=await advance(job,'pin_sending');failureCode='mail_uncertain';
     // Resolve the approved PIN delivery stage; link-only approvals send no code.
     if(messages.pin&&(await mailer.send(messages.pin))?.accepted!==true)unavailable();job=await advance(job,'sent');
    }
    return {processed:true,...publicState(job)};
   }catch{
    // A transport timeout may occur after provider/SMTP acceptance. Never retry
    // that external effect automatically; retain a durable reviewable outcome.
    try{job=await advance(job,'needs_review',{failureCode});}catch{/* Another worker or revocation owns the row. */}
    return {processed:true,id:job.id,status:'needs_review'};
   }
  }
 };
}
