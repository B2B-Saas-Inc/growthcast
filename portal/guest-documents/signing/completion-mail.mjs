import {createHash,randomUUID} from 'node:crypto';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function completionMessage(row,bytes){
 return {from:'GrowthCast <clients@growthcast.app>',replyTo:'clients@growthcast.app',to:row.recipient_email,
  subject:`Your signed document: ${row.title}`,messageId:`<growthcast-${row.id}-completed@growthcast.app>`,
  text:`Your document “${row.title}” has been signed. The executed PDF is attached.\n\nGrowthCast · Client portal`,
  html:`<!doctype html><html lang="en"><body style="margin:0;background:#f4f1e9;color:#242426;font-family:Manrope,Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:16px auto;padding:24px;background:#faf8f2;border:1px solid #d8d2c5;border-top:3px solid #ff6b4a"><p style="font-size:30px;font-weight:700;letter-spacing:-1.4px;margin:0 0 24px">GrowthCast</p><h1 style="font-size:24px">Your signed document</h1><p>“${escape(row.title)}” has been signed. Your executed PDF is attached.</p><hr style="border:0;border-top:1px solid #d8d2c5;margin:28px 0 16px"><p style="font-family:'DM Mono','Courier New',monospace;font-size:11px;color:#716d64">GROWTHCAST · CLIENT PORTAL</p></main></body></html>`,
  attachments:[{filename:'signed-document.pdf',content:bytes,contentType:'application/pdf',contentDisposition:'attachment'}]};
}
// The immutable completion is published only after canonical/signature verification.
// Use the existing append-only event history and lock its parent to claim once.
// An interrupted SMTP call is retained for review, never retried automatically.
export function completionMail({pool,organizationId,readArtifact,mailer}){
 if(!pool?.connect||!pool?.query||!organizationId||typeof readArtifact!=='function'||!mailer?.send)throw Error('Completion mail dependencies required');
 const query=`SELECT s.id,c.sha256,c.storage_key,a.recipient_email,v.title FROM gc_atrium.guest_completed c
  JOIN gc_atrium.guest_send s ON s.id=c.send_id JOIN gc_atrium.guest_approval a ON a.id=s.approval_id
  JOIN gc_atrium.guest_version v ON v.id=s.version_id WHERE s.organization_id=$1
  AND NOT EXISTS(SELECT 1 FROM gc_atrium.guest_send_event e WHERE e.send_id=s.id AND e.status LIKE 'completion_mail_%')`;
 const event=(db,id,status)=>db.query('INSERT INTO gc_atrium.guest_send_event(id,send_id,status) VALUES($1,$2,$3)',[randomUUID(),id,status]);
 return {async runOnce(){
  const {rows}=await pool.query(query+' ORDER BY s.id LIMIT 1',[organizationId]);if(!rows[0])return {processed:false};const row=rows[0];
  const stored=await readArtifact(row.storage_key),bytes=stored?.bytes;
  if(!Buffer.isBuffer(bytes)||bytes.length>16*1024*1024||stored.contentType!=='application/pdf'||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Verified completion attachment unavailable');
  const db=await pool.connect();let claimed=false;
  try{await db.query('BEGIN');
   const lock=await db.query('SELECT id FROM gc_atrium.guest_send WHERE organization_id=$1 AND id=$2 FOR UPDATE SKIP LOCKED',[organizationId,row.id]);
   // A separate statement observes any claim committed before this lock.
   if(lock.rowCount&&(await db.query(query+' AND s.id=$2',[organizationId,row.id])).rowCount){await event(db,row.id,'completion_mail_sending');claimed=true;}await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  if(!claimed)return {processed:false};
  try{if((await mailer.send(completionMessage(row,bytes)))?.accepted!==true)throw Error();await event(pool,row.id,'completion_mail_accepted');return {processed:true,accepted:true};}
  catch{await event(pool,row.id,'completion_mail_uncertain');return {processed:true,accepted:false};}
 }};
}
