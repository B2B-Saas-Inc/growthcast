"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {HtmlPreview,isHtmlFile} from "@/components/html-preview";
import {apiFetch, type PaginatedResponse} from "@/lib/api";
import {formatBytes} from "@/lib/utils";
import {useToast} from "@/components/toast";
import {useConfirm} from "@/components/confirm-modal";
import {Pagination} from "@/components/pagination";
import {Upload, Download, Archive, BookOpen, X} from "lucide-react";

type LibraryFile={id:string;filename:string;sizeBytes:number;createdAt:string};
const button="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)] disabled:opacity-50";
const accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.md,.txt,.html,.htm,.ppt,.pptx,.rtf,.odt,.ods,.jpg,.jpeg,.png,.webp";
export function LibraryFiles({projectId,onAdded}:{projectId?:string;onAdded?:()=>void}) {
 const [page,setPage]=useState(1),[result,setResult]=useState<PaginatedResponse<LibraryFile>|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[failure,setFailure]=useState<string|null>(null);
 const [preview,setPreview]=useState<LibraryFile|null>(null);
 const input=useRef<HTMLInputElement>(null);const {success,error}=useToast();const confirm=useConfirm();
 const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setFailure(null);try{setResult(await apiFetch<PaginatedResponse<LibraryFile>>(`/library?page=${page}&limit=20`,{signal}));}catch(e){if(!signal?.aborted)setFailure(e instanceof Error?e.message:"Could not load the Library");}finally{if(!signal?.aborted)setLoading(false);}},[page]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
 async function upload(file:File) {
  if(file.size>2*1024*1024){error("Files must be 2 MB or smaller");return;}
  setBusy(true);try{const body=new FormData();body.append("file",file);await apiFetch("/library/upload",{method:"POST",body});success("Added to Library");if(page===1)await load();else setPage(1);}catch(e){error(e instanceof Error?e.message:"Upload failed");}finally{setBusy(false);if(input.current)input.current.value="";}
 }
 async function add(file:LibraryFile) {
  setBusy(true);try{const result=await apiFetch<{alreadyAdded:boolean}>(`/library/${file.id}/share`,{method:"POST",body:JSON.stringify({projectId})});success(result.alreadyAdded?"This file is already in the project":"File added to project");onAdded?.();}catch(e){error(e instanceof Error?e.message:"Could not add file");}finally{setBusy(false);}
 }
 async function archive(file:LibraryFile) {
  if(!await confirm({title:"Archive Library file",message:"Remove this original from the Library? Copies already shared with projects will remain available.",confirmLabel:"Archive"}))return;
  setBusy(true);try{await apiFetch(`/library/${file.id}/archive`,{method:"POST"});success("Library file archived");if(result?.data.length===1&&page>1)setPage(page-1);else await load();}catch(e){error(e instanceof Error?e.message:"Could not archive file");}finally{setBusy(false);}
 }
 return <div className="space-y-4">
  {preview&&<HtmlPreview path={`/api/library/${preview.id}/download`} title={preview.filename} onClose={()=>setPreview(null)}/>}
  <p className="text-sm text-[var(--muted-foreground)]">{projectId?"Add a copy to this project. Assigned clients can download it; no email or signature request is sent.":"Store reusable SOPs and resources here. Files stay private to admins until added to a project."}</p>
  {!projectId&&<div className="space-y-2"><input ref={input} type="file" aria-label="Upload Library file" accept={accept} className="hidden" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/><button className={button} disabled={busy} onClick={()=>input.current?.click()}><Upload size={16}/>{busy?"Working…":"Upload file"}</button><p className="text-xs text-[var(--muted-foreground)]">Word, Excel, Markdown, CSV, HTML, PDF, presentations, text and images · up to 2 MB per file. HTML opens in a preview.</p></div>}
  {failure?<div role="alert" className="text-sm"><p>{failure}</p><button className={button} onClick={()=>void load()}>Retry</button></div>:loading?<p role="status">Loading Library…</p>:!result?.data.length?<div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center"><BookOpen className="mx-auto mb-3" size={24}/><p>No Library files yet.</p></div>:<ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">{result.data.map(file=><li key={file.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="break-words font-medium">{file.filename}</p><p className="text-xs text-[var(--muted-foreground)]">{formatBytes(file.sizeBytes)}</p></div><div className="flex flex-wrap gap-2">{projectId?<button className={button} disabled={busy} onClick={()=>void add(file)}>Add to project</button>:<>{isHtmlFile(file.filename)?<button className={button} onClick={()=>setPreview(file)}>Preview</button>:<a className={button} href={`/api/library/${file.id}/download`} download={file.filename} aria-label={`Download ${file.filename}`}><Download size={16}/></a>}<button className={button} disabled={busy} onClick={()=>void archive(file)} aria-label={`Archive ${file.filename}`}><Archive size={16}/></button></>}</div></li>)}</ul>}
  {result&&result.meta.totalPages>1&&<Pagination page={page} totalPages={result.meta.totalPages} onPageChange={setPage}/>}
 </div>;
}
export function LibraryPage(){return <div className="max-w-5xl mx-auto space-y-6"><div><h1 className="text-2xl font-semibold">Library</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Reusable files for your client projects</p></div><LibraryFiles/></div>;}
export function LibraryPicker({projectId,onClose,onAdded}:{projectId:string;onClose:()=>void;onAdded:()=>void}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.focus();return()=>previous?.focus();},[]);
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="library-title" className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-[var(--background)] p-6 shadow-xl" onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){const focusable=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');if(!focusable?.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){e.preventDefault();first.focus();}}}}><div className="mb-4 flex items-center justify-between"><h2 id="library-title" className="text-lg font-semibold">Add from Library</h2><button className={button} onClick={onClose} aria-label="Close Library"><X size={16}/></button></div><LibraryFiles projectId={projectId} onAdded={onAdded}/></div></div>;
}
