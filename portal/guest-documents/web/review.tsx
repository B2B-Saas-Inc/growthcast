"use client";
import {useEffect,useRef,useState} from "react";
import DocumentSend from "@/components/guest-document-send";
import {SigningFields,type SigningField} from "@/components/guest-signing-fields";
import {apiFetch} from "@/lib/api";
import {Document,Page,pdfjs} from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc="/guest-pdf.worker.mjs";
export default function DocumentReview({versionId,clientId,title,onClose}:{versionId:string;clientId:string;title:string;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),container=useRef<HTMLDivElement>(null);
 type Recipient={id:string;client_id:string;email:string};
 type Preview={version_id:string;recipient_id:string;recipient_email:string;title:string;version:number;previewSha256:string;message:{from:string;replyTo:string;to:string;document:{subject:string;html:string;text:string};pin:{subject:string;html:string;text:string}}};
 const [recipients,setRecipients]=useState<Recipient[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[recipient,setRecipient]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null),[confirmed,setConfirmed]=useState(false),[rendered,setRendered]=useState(false),[busy,setBusy]=useState(false),[approved,setApproved]=useState(false),[error,setError]=useState("");
 const [requirePin,setRequirePin]=useState(true);
 const [approvalId,setApprovalId]=useState<string|null>(null);
 const [deliveryStatus,setDeliveryStatus]=useState<"checking"|"empty"|"existing">("empty");
 const locked=approved||deliveryStatus!=="empty";
 const [fields,setFields]=useState<SigningField[]>([]),[fieldsLoading,setFieldsLoading]=useState(false);
 const [detected,setDetected]=useState<SigningField[]>([]),[tagWarnings,setTagWarnings]=useState<string[]>([]),[tagsReady,setTagsReady]=useState(false),[tagError,setTagError]=useState("");
 useEffect(()=>{const controller=new AbortController();void apiFetch<{fields:SigningField[];warnings:string[]}>(`/guest/staff/placeholders?versionId=${encodeURIComponent(versionId)}`,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setDetected(result.fields);setTagWarnings(result.warnings);setTagsReady(true);}}).catch(()=>{if(!controller.signal.aborted){setTagError("Could not check document tags. Reopen the preview to try again.");}});return()=>controller.abort();},[versionId]);
 const validFields=fields.length===0||fields.some(f=>f.type==="SIGNATURE")&&fields.every(f=>f.label.trim()&&!/[\x00-\x1f]/.test(f.label));
 const pending=useRef(false),recipientRequest=useRef<AbortController|null>(null);
 async function loadRecipients(after?:string) {
  recipientRequest.current?.abort();const controller=new AbortController();recipientRequest.current=controller;setLoading(true);setError("");
  try {const query=new URLSearchParams({collection:"recipients",limit:"25"});if(after)query.set("after",after);
   const data=await apiFetch<{recipients:{items:Recipient[];nextCursor:string|null}}>(`/guest/staff/catalog?${query}`,{signal:controller.signal});
   if(controller.signal.aborted)return;setRecipients(previous=>after?[...new Map([...previous,...data.recipients.items].map(row=>[row.id,row])).values()]:data.recipients.items);setCursor(data.recipients.nextCursor);
  }catch{if(!controller.signal.aborted)setError("Could not load recipients. Try loading recipients again.");}
  finally{if(!controller.signal.aborted)setLoading(false);}
 }
 useEffect(()=>{void loadRecipients();return()=>recipientRequest.current?.abort();},[]);
 useEffect(()=>{
  setPreview(null);setConfirmed(false);setApproved(false);setFields([]);setRequirePin(true);setApprovalId(null);setDeliveryStatus("empty");
  if(!recipient||!tagsReady){setFieldsLoading(false);return;}
  const controller=new AbortController();setFieldsLoading(true);
  void apiFetch<{fields:SigningField[];approvalId:string|null;requirePin:boolean}>(`/guest/staff/fields?versionId=${encodeURIComponent(versionId)}&recipientId=${encodeURIComponent(recipient)}`,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setFields(result.approvalId?result.fields:detected);setRequirePin(result.requirePin);setApprovalId(result.approvalId);setDeliveryStatus(result.approvalId?"checking":"empty");setFieldsLoading(false);}}).catch(()=>{if(!controller.signal.aborted)setError("Could not load saved fields. Reopen this preview to try again.");});
  return()=>controller.abort();
 },[recipient,versionId,tagsReady,detected]);
 useEffect(()=>{
  setPreview(null);setConfirmed(false);setApproved(false);if(!recipient||!validFields||fieldsLoading||!tagsReady||tagWarnings.length)return;
  const controller=new AbortController();
  void apiFetch<Preview>("/guest/staff/preview",{method:"POST",body:JSON.stringify({versionId,recipientId:recipient,requirePin,...(fields.length?{fields}:{})}),signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setPreview(value);}).catch(()=>{if(!controller.signal.aborted)setError("Could not prepare approval. Select the recipient again or reopen the preview.");});
  return()=>controller.abort();
 },[recipient,versionId,fields,requirePin,validFields,fieldsLoading,tagsReady,tagWarnings]);
 async function approve() {
  if(pending.current||!preview||!confirmed||!rendered||failed||preview.recipient_id!==recipient)return;
  pending.current=true;setBusy(true);setError("");
  try {const id=await apiFetch<string>("/guest/staff/approve",{method:"POST",body:JSON.stringify({version:versionId,recipient,requirePin,previewSha256:preview.previewSha256,expiresAt:new Date(Date.now()+7*86400000).toISOString(),...(fields.length?{fields}:{})})});setApprovalId(id);setApproved(true);}
  catch{setError("Approval could not be confirmed. Close this preview before trying again. No message was sent.");setConfirmed(false);}
  finally{pending.current=false;setBusy(false);}
 }
 const [pages,setPages]=useState(0),[page,setPage]=useState(1),[width,setWidth]=useState(300),[failed,setFailed]=useState(false);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(entries=>setWidth(Math.min(760,entries[0].contentRect.width)));observer.observe(node);return()=>observer.disconnect();},[]);
 return <dialog ref={dialog} onCancel={event=>{event.preventDefault();onClose();}} aria-labelledby="pdf-review-title" className="m-auto w-[95vw] max-w-4xl max-h-[90vh] overflow-auto border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--foreground)] backdrop:bg-black/60">
  <header className="mb-4 flex items-center justify-between gap-3"><h2 id="pdf-review-title" className="min-w-0 break-words text-lg font-semibold">{title}</h2><button type="button" autoFocus onClick={onClose} className="shrink-0 border border-[var(--border)] px-3 py-2">Close preview</button></header>
  {failed&&<p role="alert">Could not display this PDF. Close the preview and refresh the catalog.</p>}
   <label className="block text-sm">Recipient<select aria-label="Approval recipient" value={recipient} disabled={busy||locked} onChange={event=>{setFieldsLoading(!!event.target.value);setPreview(null);setConfirmed(false);setRecipient(event.target.value);setError("");}} className="mt-1 w-full min-w-0 border border-[var(--border)] bg-[var(--background)] p-2"><option value="">Select a recipient</option>{recipients.filter(row=>row.client_id===clientId).map(row=><option key={row.id} value={row.id}>{row.email}</option>)}</select></label>
  <details className="my-3 text-sm"><summary className="cursor-pointer">Use Documenso field tags</summary><p className="mt-2">In Word or Google Docs, add tags such as <code>{"{{signature, r1}}"}</code> or <code>{"{{text, r1, required=true, label=Company Name}}"}</code>, then export to PDF. The r1 fields are assigned to the recipient you select here. Supported types: signature, initials, name, email, date, text, number and checkbox. Keep each tag on one line.</p></details>
  {!tagsReady&&!tagError&&<p role="status" className="text-sm">Checking document field tags…</p>}
  {tagError&&<p role="alert" className="text-sm">{tagError}</p>}
  {detected.length>0&&<p role="status" className="text-sm">Detected {detected.length} Documenso field tags. Select a recipient to review the imported fields.</p>}
  {tagWarnings.length>0&&<div role="alert" className="my-3 text-sm"><p>Update these tags in the source document and upload a new PDF before approval:</p><ul>{tagWarnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
  <SigningFields fields={fields} onChange={value=>{setPreview(null);setConfirmed(false);setApprovalId(null);setFields(value);setError("");}} page={page} pages={pages} disabled={busy||locked||fieldsLoading||!recipient||!tagsReady}/>
  {!validFields&&<p role="status">Add a signature field and a label for every field before approval.</p>}
  <div ref={container} className="min-w-0" aria-label="Stored PDF preview">
   <Document file={`/api/guest/staff/artifact?versionId=${encodeURIComponent(versionId)}`} onLoadSuccess={result=>setPages(result.numPages)} onLoadError={()=>setFailed(true)} loading={<p role="status">Loading PDF…</p>} error={<></>}>
    {!failed&&<div className="relative w-fit"><Page pageNumber={page} width={width} renderAnnotationLayer={false} onRenderSuccess={()=>setRendered(true)} onRenderError={()=>setFailed(true)}/>{fields.map((field,index)=>field.page===page&&<div key={index} aria-label={`PDF field ${index+1}: ${field.label}`} className="pointer-events-none absolute overflow-hidden border-2 border-[#ff6b4a] bg-[#ff6b4a]/20 p-1 text-xs font-semibold text-black" style={{left:`${field.positionX}%`,top:`${field.positionY}%`,width:`${field.width}%`,height:`${field.height}%`}}>{index+1}. {field.label}{field.required?" *":""}</div>)}</div>}
   </Document>
  </div>
  {pages>0&&!failed&&<nav aria-label="PDF pages" className="mt-4 flex items-center justify-between gap-2"><button disabled={page===1} className="border border-[var(--border)] px-3 py-2 disabled:opacity-50" onClick={()=>setPage(p=>p-1)}>Previous page</button><span>Page {page} of {pages}</span><button disabled={page===pages} className="border border-[var(--border)] px-3 py-2 disabled:opacity-50" onClick={()=>setPage(p=>p+1)}>Next page</button></nav>}
  <section aria-labelledby="approval-title" className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
   <h3 id="approval-title" className="font-semibold">Approve this document version</h3>
   <p className="text-sm">Approval is valid for seven days. Review the email preview and access setting below. No email is sent here.</p>

   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={requirePin} disabled={busy||locked} onChange={event=>{setRequirePin(event.target.checked);setApprovalId(null);}}/>Require PIN</label><p className="text-sm">{requirePin?"The recipient receives an eight-digit code in a separate email.":"Anyone with the private email link can review and sign without a PIN."}</p>
   {!approved&&<button disabled={loading||busy} className="border border-[var(--border)] px-3 py-2 disabled:opacity-50" onClick={()=>void loadRecipients(cursor??undefined)}>{loading?"Loading recipients…":cursor?"Load more recipients":"Refresh recipients"}</button>}
   {!loading&&!cursor&&!recipients.some(row=>row.client_id===clientId)&&<p className="text-sm">Add a recipient for this client under Clients & recipients.</p>}
   {preview&&preview.recipient_id===recipient&&<p className="break-words text-sm">Version {preview.version}: {preview.title} · For {preview.recipient_email}</p>}
   {preview&&preview.recipient_id===recipient&&<section aria-label="Email preview" className="space-y-3">
    <h4 className="font-semibold">Email preview</h4>
    <p className="break-words text-sm">From: {preview.message.from}<br/>Reply to: {preview.message.replyTo}<br/>To: {preview.message.to}</p>
    <p className="text-sm">{requirePin?"Sending generates the private link and a separate eight-digit code email. A portal account is not required.":"Sending generates one private document link email. No PIN or portal account is required."}</p>
    {(requirePin?(["document","pin"] as const):(["document"] as const)).map(kind=><details key={kind} open className="border border-[var(--border)] p-2"><summary className="cursor-pointer break-words text-sm">{kind==="document"?"Document email":"Separate code email"}: {preview.message[kind].subject}</summary><iframe title={kind==="document"?"Document email preview":"Code email preview"} sandbox="" referrerPolicy="no-referrer" srcDoc={preview.message[kind].html} className="mt-2 h-[430px] w-full border-0"/><details><summary className="cursor-pointer text-sm">Plain text alternative</summary><pre className="whitespace-pre-wrap break-words text-sm">{preview.message[kind].text}</pre></details></details>)}
   </section>}
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={!preview||!rendered||failed||busy||locked} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed this PDF, its recipient fields, the email preview, and the selected access policy for the selected recipient.</label>
   <button disabled={!preview||!confirmed||!rendered||failed||busy||locked} onClick={()=>void approve()} className="border border-[var(--border)] bg-[var(--primary)] px-3 py-2 text-white disabled:opacity-50">{busy?"Saving approval…":deliveryStatus==="existing"?"Delivery requested":approved?"Document approved":"Approve document"}</button>
   {approved&&<p role="status">Document version approved.</p>}
   {deliveryStatus==="existing"&&<p className="text-sm">Delivery has been requested for this version. Its approved fields are locked.</p>}
   {approvalId&&fields.length>0&&<DocumentSend key={approvalId} approvalId={approvalId} onStatus={setDeliveryStatus}/>}
   {error&&<p role="alert">{error}</p>}
  </section>
 </dialog>;
}
