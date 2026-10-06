"use client";

import {useCallback, useEffect, useRef, useState, type FormEvent} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const DocumentReview=dynamic(()=>import("./guest-document-review"),{ssr:false});
import {CatalogMenu,CatalogDialog,type CatalogAction,type CatalogEntity} from "./guest-catalog-actions";
import {apiFetch} from "@/lib/api";

type Client={id:string;name:string};
type Recipient={id:string;client_id:string;email:string};
type Project={id:string;name:string};
type Document={id:string;client_id:string;project_id:string;kind:string;version_id:string|null;version:number|null;title:string|null};
type Collections={clients:Client;recipients:Recipient;projects:Project;documents:Document};
type Page<T>={items:T[];nextCursor:string|null;truncated:boolean};
const input="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2";
const buttonBase="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-50";
const button=buttonBase+" hover:bg-[var(--muted)]";
const primary=buttonBase+" bg-[var(--primary)] text-white hover:opacity-90";

function useCatalog<K extends keyof Collections>(collection:K) {
 const [items,setItems]=useState<Collections[K][]>([]),[next,setNext]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const request=useRef<AbortController|null>(null);
 const load=useCallback(async(after?:string)=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setLoading(true);setError(false);
  try {
   const params=new URLSearchParams({collection,limit:"25"});if(after)params.set("after",after);
   const data=await apiFetch<Partial<{[P in keyof Collections]:Page<Collections[P]>}>>(`/guest/staff/catalog?${params}`,{signal:controller.signal});
   const page=data[collection] as Page<Collections[K]>|undefined;if(!page)throw Error("Unavailable");
   if(controller.signal.aborted)return;
   setItems(previous=>after?[...new Map([...previous,...page.items].map(row=>[row.id,row])).values()]:page.items);setNext(page.nextCursor);
  } catch {if(!controller.signal.aborted){setError(true);if(!after){setItems([]);setNext(null);}}}
  finally {if(!controller.signal.aborted)setLoading(false);}
 },[collection]);
 useEffect(()=>{void load();return()=>request.current?.abort();},[load]);
 return {items,next,loading,error,refresh:()=>load(),more:()=>load(next??undefined),remember:(item:Collections[K])=>setItems(previous=>[item,...previous.filter(row=>row.id!==item.id)])};
}
function Pager({page,label}:{page:{next:string|null;loading:boolean;error:boolean;more:()=>Promise<void>;refresh:()=>Promise<void>};label:string}) {
 return <div className="space-y-2">
  {page.error&&<p role="alert" className="text-sm text-red-600">Could not load {label}. <button className="underline" onClick={()=>void(page.next?page.more():page.refresh())}>Try again</button></p>}
  {page.next&&<button className={button} disabled={page.loading} onClick={()=>void page.more()}>{page.loading?"Loading…":`Load more ${label}`}</button>}
 </div>;
}

export function GuestDocumentsPage() {
 const clients=useCatalog("clients"),recipients=useCatalog("recipients"),projects=useCatalog("projects"),documents=useCatalog("documents");
 const [tab,setTab]=useState<"documents"|"people">("documents"),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[failure,setFailure]=useState("");
 const pending=useRef(false);
 const [action,setAction]=useState<CatalogAction|null>(null),[creating,setCreating]=useState<CatalogEntity|null>(null);
 const rowActions=(entity:CatalogEntity,id:string)=>[{label:"View details",run:()=>setAction({entity,id,mode:"view"})},{label:"Edit",run:()=>setAction({entity,id,mode:"edit"})},{label:"Delete",danger:true,run:()=>setAction({entity,id,mode:"delete"})}];
 const refreshAll=async(id?:string)=>{await Promise.all(action?.entity==="clients"&&action.mode==="delete"?[clients.refresh(),recipients.refresh(),documents.refresh()]:[action?.entity==="clients"?clients.refresh():action?.entity==="recipients"?recipients.refresh():documents.refresh()]);if(id&&action){const row=await apiFetch<Client|Recipient|Document>(`/guest/staff/record?entity=${action.entity}&id=${encodeURIComponent(id)}`);if(action.entity==="clients")clients.remember(row as Client);else if(action.entity==="recipients")recipients.remember(row as Recipient);else documents.remember(row as Document);}setNotice("Catalog updated.");};
 const [uploading,setUploading]=useState<Document|null>(null),[review,setReview]=useState<Document|null>(null);
 async function submit(event:FormEvent<HTMLFormElement>,route:string,keys:string[],done:(id:string,values:Record<string,string>)=>Promise<void>,message:string) {
  event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setFailure("");setNotice("");
  const form=event.currentTarget,data=new FormData(form);const body=Object.fromEntries(keys.map(key=>[key,String(data.get(key)??"").trim()]));
  try {const id=await apiFetch<string>(`/guest/staff/${route}`,{method:"POST",body:JSON.stringify(body)});form.reset();setCreating(null);setNotice(message);await done(id,body);}
  catch {setFailure("Could not save. Check your selections and try again.");}
  finally {pending.current=false;setBusy(false);}
 }
 async function upload(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();if(pending.current||!uploading)return;
  const form=event.currentTarget,data=new FormData(form),file=data.get("pdf"),title=String(data.get("title")??"").trim(),document=uploading;
  setNotice("");setFailure("");
  if(!(file instanceof File)||file.size<8||file.size>3*1024*1024||!file.name.toLowerCase().endsWith(".pdf")){setFailure("Choose a PDF up to 3 MB.");return;}
  pending.current=true;setBusy(true);
  try{
   const version=await apiFetch<{id:string;version:number}>("/guest/staff/upload",{method:"POST",headers:{"Content-Type":"application/pdf","x-growthcast-document-id":document.id,"x-growthcast-document-title":encodeURIComponent(title)},body:file});
   await documents.refresh();documents.remember({...document,title,version_id:version.id,version:version.version});setUploading(null);setNotice("PDF uploaded. No message was sent.");
  }catch{setFailure("Upload could not be confirmed. Refresh the catalog before retrying. Choose a PDF under 3 MB.");}
  finally{pending.current=false;setBusy(false);}
 }
 const clientOptions=clients.items.map(client=><option key={client.id} value={client.id}>{client.name}</option>);
 return <div className="max-w-6xl space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Documents</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Organize proposals and contracts by client and project.</p></div><Link className={button} href="/dashboard">Back to Overview</Link></div>
  <div className="flex gap-2" aria-label="Document views"><button className={tab==="documents"?primary:button} aria-pressed={tab==="documents"} onClick={()=>setTab("documents")}>Documents</button><button className={tab==="people"?primary:button} aria-pressed={tab==="people"} onClick={()=>setTab("people")}>Clients & recipients</button></div>
  <p role="status" aria-live="polite" className="text-sm">{notice}</p>{failure&&<p role="alert" className="text-sm text-red-600">{failure}</p>}
  {action&&<CatalogDialog key={`${action.entity}:${action.id}:${action.mode}`} action={action} onClose={()=>setAction(null)} onSaved={refreshAll}/>}
  {review?.version_id&&<DocumentReview key={review.version_id} versionId={review.version_id} clientId={review.client_id} title={review.title??"Document"} onClose={()=>setReview(null)}/>}
  {uploading&&<section key={uploading.id} className="space-y-3 rounded-lg border border-[var(--border)] p-5" aria-labelledby="upload-pdf"><h2 id="upload-pdf" className="text-lg font-semibold">Upload a PDF version</h2><p className="text-sm">Each upload creates a new version. Existing versions stay unchanged.</p><form onSubmit={event=>void upload(event)} className="space-y-3"><label className="block text-sm">Document title<input name="title" required maxLength={200} defaultValue={uploading.title??""} className={input} disabled={busy}/></label><label className="block text-sm">PDF file<input name="pdf" type="file" accept="application/pdf,.pdf" required className={input} disabled={busy}/></label><div className="flex gap-2"><button className={primary} disabled={busy}>{busy?"Uploading PDF…":"Upload PDF"}</button><button type="button" className={button} disabled={busy} onClick={()=>{setUploading(null);setFailure("");}}>Cancel upload</button></div></form></section>}
  {tab==="documents"?<>
   {creating==="documents"&&<section className="space-y-4 rounded-xl border border-[var(--border)] p-5" aria-labelledby="new-document"><h2 id="new-document" className="text-lg font-semibold">Create a document draft</h2>
    <form className="grid gap-4 sm:grid-cols-3" onSubmit={e=>void submit(e,"documents",["clientId","projectId","kind"],async(id,v)=>{await documents.refresh();documents.remember({id,client_id:v.clientId,project_id:v.projectId,kind:v.kind,version_id:null,version:null,title:null});},"Document draft created.")}>
     <label className="space-y-1 text-sm">Client<select name="clientId" required className={input} disabled={busy||clients.loading} defaultValue=""><option value="" disabled>Select a client</option>{clientOptions}</select></label>
     <label className="space-y-1 text-sm">Project<select name="projectId" required className={input} disabled={busy||projects.loading} defaultValue=""><option value="" disabled>Select a project</option>{projects.items.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <label className="space-y-1 text-sm">Document type<select name="kind" className={input} disabled={busy}><option value="proposal">Proposal</option><option value="contract">Contract</option><option value="nda">NDA</option><option value="supporting">Supporting document</option></select></label>
     <div className="sm:col-span-3"><button className={primary} disabled={busy||!clients.items.length||!projects.items.length}>{busy?"Saving…":"Create draft"}</button></div>
    </form>
    {!clients.loading&&!clients.error&&!clients.items.length&&<p className="text-sm">Add a client under Clients & recipients to create a draft.</p>}
    {!projects.loading&&!projects.error&&!projects.items.length&&<p className="text-sm">Create an active project in <Link href="/dashboard/projects" className="underline">Projects</Link> first.</p>}
    <Pager page={clients} label="clients"/><Pager page={projects} label="projects"/><button type="button" className={button} onClick={()=>setCreating(null)}>Cancel</button>
   </section>}
   <section className="space-y-4" aria-labelledby="document-catalog"><div className="flex items-center justify-between gap-2"><h2 id="document-catalog" className="text-lg font-semibold">Document catalog</h2><CatalogMenu label="Document catalog actions" actions={[{label:"Create document",run:()=>setCreating("documents")},{label:"Refresh documents",run:()=>void documents.refresh()}]}/></div>
    {documents.loading&&!documents.items.length?<p role="status">Loading documents…</p>:!documents.error&&!documents.items.length?<p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">No documents yet. Create a draft to get started.</p>:null}
    <ul className="space-y-3">{documents.items.map(d=><li key={d.id} className="rounded-lg border border-[var(--border)] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-medium">{d.title??`Untitled ${d.kind==="nda"?"NDA":d.kind}`}</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">{d.version?`Version ${d.version}`:"Draft · no file attached"}</p>{projects.items.find(p=>p.id===d.project_id)&&<p className="mt-1 text-sm text-[var(--muted-foreground)]">{projects.items.find(p=>p.id===d.project_id)?.name}</p>}</div><CatalogMenu label={`Actions for ${d.title??`Untitled ${d.kind}`}`} disabled={busy} actions={[...(d.version_id?[{label:"Review PDF",run:()=>setReview(d)}]:[]),{label:d.version_id?"Upload new version":"Add PDF",run:()=>{setUploading(d);setFailure("");setNotice("");window.scrollTo({top:0,behavior:"smooth"});}},...rowActions("documents",d.id)]}/></div></li>)}</ul>
    <Pager page={documents} label="documents"/>
   </section>
  </>:<div className="grid items-start gap-6 lg:grid-cols-2">
   <section className="space-y-4 rounded-xl border border-[var(--border)] p-5" aria-labelledby="clients-title"><div className="flex items-center justify-between"><h2 id="clients-title" className="text-lg font-semibold">Clients</h2><CatalogMenu label="Clients actions" actions={[{label:"Add client",run:()=>setCreating("clients")},{label:"Refresh clients",run:()=>void clients.refresh()}]}/></div>{creating==="clients"&&<form className="space-y-3" onSubmit={e=>void submit(e,"clients",["name"],async(id,v)=>{await clients.refresh();clients.remember({id,name:v.name});},"Client added.")}><label className="block space-y-1 text-sm">Client name<input name="name" required maxLength={200} className={input} disabled={busy}/></label><button className={primary} disabled={busy}>Add client</button><button type="button" className={button} onClick={()=>setCreating(null)}>Cancel</button></form>}<ul className="space-y-2">{clients.items.map(c=><li key={c.id} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 text-sm"><span className="min-w-0 break-words">{c.name}</span><CatalogMenu label={`Actions for ${c.name}`} disabled={busy} actions={rowActions("clients",c.id)}/></li>)}</ul><Pager page={clients} label="clients"/></section>
   <section className="space-y-4 rounded-xl border border-[var(--border)] p-5" aria-labelledby="recipients-title"><div className="flex items-center justify-between"><h2 id="recipients-title" className="text-lg font-semibold">Recipients</h2><CatalogMenu label="Recipients actions" actions={[{label:"Add recipient",run:()=>setCreating("recipients")},{label:"Refresh recipients",run:()=>void recipients.refresh()}]}/></div>{creating==="recipients"&&<form className="space-y-3" onSubmit={e=>void submit(e,"recipients",["clientId","email"],async(id,v)=>{await recipients.refresh();recipients.remember({id,client_id:v.clientId,email:v.email.toLowerCase()});},"Recipient added.")}><label className="block space-y-1 text-sm">Recipient’s client<select name="clientId" required defaultValue="" className={input} disabled={busy||clients.loading}><option value="" disabled>Select a client</option>{clientOptions}</select></label><label className="block space-y-1 text-sm">Email address<input name="email" type="email" required maxLength={254} className={input} disabled={busy}/></label><button className={primary} disabled={busy||!clients.items.length}>Add recipient</button><button type="button" className={button} onClick={()=>setCreating(null)}>Cancel</button></form>}<ul className="space-y-2">{recipients.items.map(r=><li key={r.id} className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-2 text-sm"><span className="min-w-0 break-all">{r.email}</span><CatalogMenu label={`Actions for ${r.email}`} disabled={busy} actions={rowActions("recipients",r.id)}/></li>)}</ul><Pager page={recipients} label="recipients"/></section>
  </div>}
 </div>;
}
