"use client";

import {useEffect, useState, type ReactNode} from "react";
import Link from "next/link";
import {ArrowUpRight, BarChart3, BookOpen, Calendar, CheckCircle, FileText, FolderKanban, Receipt, TrendingUp, Users, type LucideIcon} from "lucide-react";
import {apiFetch} from "@/lib/api";
import {formatCurrency} from "@/lib/format";

type Page<T> = {data:T[];meta:{total:number}};
type Project = {id:string;name:string;status:string};
type Person = {id:string;role:string;user:{name:string;email:string}};
type Event = {id:string;type:string;date:string;title:string;projectName:string|null};
type LibraryFile = {id:string;filename:string;sizeBytes:number};
type Document = {id:string;title:string|null;kind:string;version:number|null};
type Report = {totals:{revenueCents:number;actualCostCents:number|null;actualMarginPercent:number|null};warnings:unknown[]};

function usePreview<T>(path:string) {
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setError(false);setData(null);
  apiFetch<T>(path,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(()=>{if(!controller.signal.aborted)setError(true);});
  return ()=>controller.abort();
 },[path,attempt]);
 return {data,error,retry:()=>setAttempt(value=>value+1)};
}
function Tile<T>({title,href,icon:Icon,preview,children}:{title:string;href:string;icon:LucideIcon;preview:ReturnType<typeof usePreview<T>>;children:(data:T)=>ReactNode}) {
 return <section aria-label={`${title} preview`} className="min-w-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6">
  <Link href={href} className="group flex items-center justify-between gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)]">
   <h2 className="flex items-center gap-3 text-lg font-semibold"><Icon size={20} className="text-[var(--muted-foreground)]" aria-hidden="true"/>{title}</h2>
   <ArrowUpRight size={19} aria-hidden="true" className="shrink-0 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]"/>
  </Link>
  <div className="mt-5 flex-1 min-h-32 text-sm">
   {preview.error?<p role="status" className="text-[var(--muted-foreground)]">Could not load this preview. <button onClick={preview.retry} className="underline underline-offset-4">Retry {title.toLowerCase()}</button></p>:preview.data===null?<p role="status" className="text-[var(--muted-foreground)]">Loading {title.toLowerCase()}…</p>:children(preview.data)}
  </div>
  <Link href={href} className="mt-5 border-t border-[var(--border)] pt-4 text-sm font-medium underline-offset-4 hover:underline">View {title.toLowerCase()} <span aria-hidden="true">→</span></Link>
 </section>;
}
function Empty({children}:{children:ReactNode}) {return <p className="text-[var(--muted-foreground)]">{children}</p>;}
function Rows({items}:{items:{id:string;title:string;detail:string;href?:string}[]}) {
 return <ul className="divide-y divide-[var(--border)]">{items.map(item=><li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
  {item.href?<Link href={item.href} className="block break-words font-medium hover:underline">{item.title}</Link>:<p className="break-words font-medium">{item.title}</p>}
  <p className="mt-1 break-words text-xs text-[var(--muted-foreground)]">{item.detail}</p>
 </li>)}</ul>;
}
const status=(value:string)=>value.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
const date=(value:string)=>new Date(value).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"});

export function OverviewPage() {
 const [period]=useState(()=>{const today=new Date();return {from:today.toISOString().slice(0,10),to:new Date(today.getTime()+30*86400000).toISOString().slice(0,10),month:today.toISOString().slice(0,7),label:today.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"})};});
 const stats=usePreview<{total:number;inProgress:number;completed:number}>("/projects/stats");
 const invoices=usePreview<{outstandingAmount:number}>("/invoices/stats");
 const projects=usePreview<Page<Project>>("/projects?limit=3");
 const calendar=usePreview<Event[]>(`/calendar?from=${period.from}&to=${period.to}&tz=UTC`);
 const people=usePreview<Page<Person>>("/clients?page=1&limit=3");
 const reports=usePreview<Report>(`/resource-planning/revenue?from=${period.month}&to=${period.month}`);
 const documents=usePreview<{documents:{items:Document[];truncated:boolean}}>("/guest/staff/catalog?collection=documents&limit=3");
 const library=usePreview<Page<LibraryFile>>("/library?page=1&limit=3");
 const summary=[
  {title:"Total Projects",value:stats.data?.total,icon:FolderKanban,resource:stats},
  {title:"In Progress",value:stats.data?.inProgress,icon:TrendingUp,resource:stats},
  {title:"Completed",value:stats.data?.completed,icon:CheckCircle,resource:stats},
  {title:"Outstanding",value:invoices.data?formatCurrency(invoices.data.outstandingAmount):undefined,icon:Receipt,resource:invoices},
 ];
 return <div className="min-w-0 space-y-8">
  <header><h1 className="text-2xl font-bold">Overview</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">A look across your workspace.</p></header>
  <section aria-label="Workspace summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{summary.map(({title,value,icon:Icon,resource})=><div key={title} className="min-w-0 rounded-lg border border-[var(--border)] p-4">
   <h2 className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><Icon size={16} aria-hidden="true"/>{title}</h2>
   {resource.error?<button onClick={resource.retry} className="mt-3 text-sm underline">Retry summary</button>:<p className="mt-1 break-words text-3xl font-bold">{value??"—"}</p>}
  </div>)}</section>
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Workspace previews">
   <Tile title="Projects" href="/dashboard/projects" icon={FolderKanban} preview={projects}>{data=><>
    <p className="mb-4 text-xs text-[var(--muted-foreground)]">Projects in this workspace · {data.meta.total}</p>
    {data.data.length?<Rows items={data.data.map(p=>({id:p.id,title:p.name,detail:status(p.status),href:`/dashboard/projects/${p.id}`}))}/>:<Empty>No projects yet. Create your first project to get started.</Empty>}
   </>}</Tile>
   <Tile title="Calendar" href="/dashboard/calendar" icon={Calendar} preview={calendar}>{data=><>
    <p className="mb-4 text-xs text-[var(--muted-foreground)]">Next 30 days · Scheduled items: {data.length}</p>
    {data.length?<Rows items={[...data].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3).map(e=>({id:`${e.type}-${e.id}`,title:e.title,detail:`${date(e.date)} · ${e.projectName||status(e.type)}`}))}/>:<Empty>No upcoming deadlines or milestones.</Empty>}
   </>}</Tile>
   <Tile title="People" href="/dashboard/clients" icon={Users} preview={people}>{data=><>
    <p className="mb-4 text-xs text-[var(--muted-foreground)]">Team and clients · {data.meta.total}</p>
    {data.data.length?<Rows items={data.data.map(p=>({id:p.id,title:p.user.name||p.user.email,detail:p.role==="member"?"Client":status(p.role)}))}/>:<Empty>Your team and clients will appear here.</Empty>}
   </>}</Tile>
   <Tile title="Reports" href="/dashboard/reports" icon={BarChart3} preview={reports}>{data=><>
    <p className="mb-4 text-xs text-[var(--muted-foreground)]">{period.label} · internal only</p>
    <dl className="space-y-3">{[["Expected revenue",formatCurrency(data.totals.revenueCents)],["Actual labor cost",data.totals.actualCostCents===null?"Incomplete":formatCurrency(data.totals.actualCostCents)],["Actual margin",data.totals.actualMarginPercent===null?"—":`${data.totals.actualMarginPercent.toFixed(1)}%`]].map(([label,value])=><div className="flex flex-wrap justify-between gap-2" key={label}><dt className="text-[var(--muted-foreground)]">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl>
    {data.warnings.length>0&&<p className="mt-3 text-xs text-[var(--muted-foreground)]">Projects needing reporting setup: {data.warnings.length}.</p>}
    <Link href="/dashboard/reports/revenue" className="mt-3 inline-block text-xs underline underline-offset-4">Monthly revenue details</Link>
   </>}</Tile>
   <Tile title="Documents" href="/dashboard/documents" icon={FileText} preview={documents}>{data=><>
    <p className="mb-4 text-xs text-[var(--muted-foreground)]">Drafts and uploaded versions</p>
    {data.documents.items.length?<Rows items={data.documents.items.map(d=>({id:d.id,title:d.title||`Untitled ${d.kind}`,detail:d.version===null?"Draft · PDF not uploaded":`Version ${d.version} · ${status(d.kind)}`}))}/>:<Empty>No documents yet. Create a draft or upload a PDF.</Empty>}
   </>}</Tile>
   <Tile title="Library" href="/dashboard/library" icon={BookOpen} preview={library}>{data=><>
    <p className="mb-4 text-xs text-[var(--muted-foreground)]">Reusable files · {data.meta.total}</p>
    {data.data.length?<Rows items={data.data.map(f=>({id:f.id,title:f.filename,detail:`${Math.max(1,Math.round(f.sizeBytes/1024))} KB · Available to share`}))}/>:<Empty>Add SOPs and resources to share with your clients.</Empty>}
   </>}</Tile>
  </div>
 </div>;
}
