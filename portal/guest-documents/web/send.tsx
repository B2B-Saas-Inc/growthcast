"use client";
import {useEffect,useRef,useState} from "react";
import {apiFetch} from "@/lib/api";
type SendState={id:string;approvalId:string;status:string;failureCode:string|null};
const terminal=new Set(["completed","needs_review","revoked"]);
export default function DocumentSend({approvalId,onStatus}:{approvalId:string;onStatus:(status:"checking"|"empty"|"existing")=>void}){
 const [enabled,setEnabled]=useState<boolean|null>(null),[state,setState]=useState<SendState|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[refresh,setRefresh]=useState(0);
 const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const controller=new AbortController();void apiFetch<{sending:boolean}>("/guest/staff/capabilities",{signal:controller.signal}).then(value=>{setEnabled(value.sending);if(!value.sending)onStatus("empty");}).catch(()=>{if(!controller.signal.aborted)setError("Could not check signing availability. Reopen this preview to try again.");});return()=>controller.abort();},[onStatus]);
 useEffect(()=>{
  if(!enabled)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  async function poll(){try{const result=await apiFetch<SendState|null>(`/guest/staff/send-status?approvalId=${encodeURIComponent(approvalId)}`,{signal:controller.signal});if(controller.signal.aborted)return;setState(result);onStatus(result?"existing":"empty");setLoaded(true);setError("");if(result&&!terminal.has(result.status))timer=setTimeout(()=>void poll(),result.status==="sent"?5000:2000);}catch{if(!controller.signal.aborted)setError("Could not confirm delivery status. Refresh before taking another action.");}}
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[approvalId,enabled,refresh,onStatus]);
 async function send(){
  if(pending.current||!loaded||state||!enabled)return;pending.current=true;setBusy(true);setError("");
  try{const result=await apiFetch<SendState>("/guest/staff/send",{method:"POST",body:JSON.stringify({approvalId})});if(mounted.current){setState(result);onStatus("existing");setRefresh(n=>n+1);}}
  catch{if(mounted.current){setError("The send request could not be confirmed. Refresh delivery status before trying again.");setLoaded(false);}}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 return <section aria-label="Signature delivery" className="space-y-3 border-t border-[var(--border)] pt-4">
  <h4 className="font-semibold">Send for signature</h4>
  {enabled===false&&<p className="text-sm">The field layout is saved. Signing delivery is not enabled in this environment yet.</p>}
  {enabled&&<><p className="text-sm">Send the approved document link to the selected recipient. A separate code email is sent only when Require PIN is enabled. Approval alone does not send email.</p>
   <button type="button" disabled={!loaded||busy||!!state} onClick={()=>void send()} className="border border-[var(--border)] bg-[var(--primary)] px-3 py-2 text-white disabled:opacity-50">{busy?"Requesting send…":"Send for signature"}</button>
   {state&&<p role="status">{state.status==="completed"?"Document signed. The verified PDF has been added to the project.":state.status==="sent"?"The approved email delivery was accepted. Awaiting signature.":state.status==="needs_review"?"Delivery needs review. A provider or email result could not be confirmed; this document will not be sent again automatically.":state.status==="revoked"?"Document access was revoked.":state.status==="link_sent"||state.status==="pin_sending"?"Document email accepted. Finishing access setup…":"Preparing document delivery…"}</p>}
  </>}
  {error&&<><p role="alert">{error}</p>{enabled&&<button type="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)} className="border border-[var(--border)] px-3 py-2">Refresh delivery status</button>}</>}
 </section>;
}
