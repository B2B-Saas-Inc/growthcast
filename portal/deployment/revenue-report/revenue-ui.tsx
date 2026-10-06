"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {apiFetch} from "@/lib/api";
type Metrics={revenueCents:number;expectedCostCents:number|null;actualCostCents:number|null;targetMarginPercent:number|null;actualMarginPercent:number|null;billedHours:number;actualHours:number};
type Row=Metrics&{month:string;projectId:string;projectName:string;clients:string[];engagementType:string;uncostedHours:number};
type Report={from:string;to:string;rows:Row[];months:(Metrics&{month:string})[];totals:Metrics;warnings:{projectId:string;projectName:string;reason:string}[]};
const money=(c:number|null)=>c===null?"Incomplete":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
const pct=(v:number|null)=>v===null?"—":`${v.toFixed(1)}%`;
const number=(v:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
const typeName=(v:string)=>({retainer:'Retainer',hourly:'Hourly',flat_fee:'Flat fee'}[v]??v);
const input="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm";
function Cells({value:v}:{value:Metrics}){return <><td>{money(v.revenueCents)}</td><td>{money(v.expectedCostCents)}</td><td>{money(v.actualCostCents)}</td><td>{pct(v.targetMarginPercent)}</td><td>{pct(v.actualMarginPercent)}</td><td>{number(v.billedHours)}</td><td>{number(v.actualHours)}</td></>;}
export function RevenuePage(){
 const year=new Date().getUTCFullYear();const [from,setFrom]=useState(`${year}-01`),[to,setTo]=useState(`${year}-12`);
 const [range,setRange]=useState({from:`${year}-01`,to:`${year}-12`});const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let current=true;setReport(null);setError('');apiFetch<Report>(`/resource-planning/revenue?from=${range.from}&to=${range.to}`).then(r=>{if(current)setReport(r);}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Could not load report');});return()=>{current=false;};},[range,retry]);
 return <div className="min-w-0 space-y-6">
  <div><h1 className="text-2xl font-semibold">Monthly client revenue</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">Internal only · USD · revenue, labor costs and gross margins</p></div>
  <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();setRange({from,to});}}><label className="text-sm grid gap-1">From<input className={input} type="month" aria-label="Report from month" required min="2000-01" max="2099-12" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm grid gap-1">Through<input className={input} type="month" aria-label="Report through month" required min={from} max="2099-12" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="rounded px-4 py-2 bg-[var(--foreground)] text-[var(--background)] text-sm">Update report</button></form>
  <p className="text-sm text-[var(--muted-foreground)]">Retainers count in every month from project start through end, without proration. Flat fees count only in the start month. Hourly revenue uses completed billable hours attached to an invoice, at their saved billing rates, grouped by the month worked (including draft invoices). No end date means the project continues through this report’s range.</p>
  {error&&<div role="alert" className="border border-red-300 p-3 text-red-700">{error} <button className="underline" onClick={()=>setRetry(x=>x+1)}>Retry</button></div>}
  {!report&&!error&&<p role="status">Loading revenue report…</p>}
  {report&&<>
   <section className="grid grid-cols-2 xl:grid-cols-5 gap-3" aria-label="Report totals">{[['Revenue',money(report.totals.revenueCents)],['Expected cost',money(report.totals.expectedCostCents)],['Actual cost',money(report.totals.actualCostCents)],['Target margin',pct(report.totals.targetMarginPercent)],['Actual margin',pct(report.totals.actualMarginPercent)]].map(([label,value])=><div key={label} className="border border-[var(--border)] p-4 min-w-0"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className="text-xl font-semibold mt-2 break-words">{value}</p></div>)}</section>
   {report.warnings.length>0&&<section className="border border-amber-300 p-4 space-y-2"><h2 className="font-semibold">Projects needing setup</h2>{report.warnings.map(w=><p key={w.projectId} className="text-sm"><Link className="underline" href={`/dashboard/projects/${w.projectId}?tab=planning`}>{w.projectName}</Link>: {w.reason}</p>)}</section>}
   <div className="max-w-full overflow-x-auto"><table aria-label="Monthly client revenue" className="w-full min-w-[1100px] text-sm text-left [&_td]:py-3 [&_td]:pr-4 [&_th]:py-3 [&_th]:pr-4"><thead><tr className="border-b border-[var(--border)]"><th scope="col">Month / client / project</th><th scope="col">Engagement</th><th scope="col">Revenue</th><th scope="col">Expected cost</th><th scope="col">Actual cost</th><th scope="col">Target margin</th><th scope="col">Actual margin</th><th scope="col">Billed hours</th><th scope="col">Logged hours</th></tr></thead>
    {report.months.map(m=><tbody key={m.month}>{report.rows.filter(r=>r.month===m.month).map(r=><tr key={r.projectId} className="border-b border-[var(--border)]"><td><span className="block text-xs text-[var(--muted-foreground)]">{r.month} · {r.clients.join(', ')||'No client assigned'}</span><Link className="underline" href={`/dashboard/projects/${r.projectId}?tab=planning`}>{r.projectName}</Link>{r.uncostedHours>0&&<span className="block text-xs text-amber-800">{number(r.uncostedHours)} hours need a cost rate</span>}</td><td>{typeName(r.engagementType)}</td><Cells value={r}/></tr>)}<tr className="font-semibold bg-[var(--muted)] border-b border-[var(--border)]"><th scope="row" colSpan={2}>{m.month} total</th><Cells value={m}/></tr></tbody>)}
    <tfoot><tr className="font-bold border-t-2 border-[var(--foreground)]"><th scope="row" colSpan={2}>All months total</th><Cells value={report.totals}/></tr></tfoot>
   </table></div>
   {report.rows.length===0&&<p>No configured projects overlap this date range.</p>}
   <p className="text-xs text-[var(--muted-foreground)]">Expected cost uses the allocated team’s weighted internal hourly cost: fee ÷ target billing rate for retainers/flat fees, and billed hours for hourly projects. Actual cost includes all completed logged work at current project cost rates, including nonbillable and uninvoiced time. Later flat-fee months can have costs with zero revenue. Missing cost rates mark costs and margins incomplete. Totals use aggregate costs and revenue, not averaged percentages. Archived/completed projects remain included according to their dates. Current plans and cost rates apply to past months; margins exclude overhead, taxes and payment collection. Dates use UTC. Maximum range: 36 months.</p>
  </>}
 </div>;
}
