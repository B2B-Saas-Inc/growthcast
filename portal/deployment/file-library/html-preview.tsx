"use client";
import {useEffect, useRef, useState} from "react";
import {X} from "lucide-react";

export const isHtmlFile=(filename:string)=>/\.html?$/i.test(filename);
// No script, same-origin, forms, popups, navigation or network privileges.
const policy="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
function inertMarkup(text:string) {
 const template=document.createElement("template");template.innerHTML=text;
 template.content.querySelectorAll("script,meta,base,link,iframe,object,embed,form").forEach(node=>node.remove());
 template.content.querySelectorAll("*").forEach(node=>{for(const attribute of [...node.attributes]){const name=attribute.name.toLowerCase();if(name.startsWith("on")||["srcdoc","action","formaction","target","download"].includes(name)||(name==="href"||name==="xlink:href")&&!attribute.value.startsWith("#"))node.removeAttribute(attribute.name);}});
 return template.innerHTML;
}
export function HtmlPreview({path,title,onClose}:{path:string;title:string;onClose:()=>void}) {
 const [html,setHtml]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const panel=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const prior=document.activeElement as HTMLElement|null;close.current?.focus();const controller=new AbortController();setHtml(null);setError(null);
  void (async()=>{try{const response=await fetch(path,{credentials:"include",signal:controller.signal,redirect:"error"});if(!response.ok)throw Error("This file is unavailable or you no longer have access.");const bytes=await response.arrayBuffer();if(bytes.byteLength>3*1024*1024)throw Error("HTML previews support files up to 3 MB.");const text=new TextDecoder().decode(bytes);if(!controller.signal.aborted)setHtml('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="'+policy+'"><meta name="referrer" content="no-referrer"></head><body>'+inertMarkup(text)+'</body></html>');}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Preview unavailable");}})();
  return()=>{controller.abort();prior?.focus();};
 },[path]);
 return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={panel} role="dialog" aria-modal="true" aria-labelledby="html-preview-title" className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-[var(--background)] shadow-xl" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}if(e.key==="Tab"&&e.shiftKey&&document.activeElement===close.current){e.preventDefault();panel.current?.querySelector('iframe')?.focus();}}}><div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4"><h2 id="html-preview-title" className="min-w-0 truncate font-semibold">{title}</h2><button ref={close} type="button" aria-label="Close HTML preview" className="rounded-lg p-2 hover:bg-[var(--muted)]" onClick={onClose}><X size={20}/></button></div>{error?<p role="alert" className="p-6">{error}</p>:html===null?<p role="status" className="p-6">Loading preview…</p>:<iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={html} className="w-full flex-1 border-0 bg-white"/>}<span tabIndex={0} onFocus={()=>close.current?.focus()}/></div></div>;
}
