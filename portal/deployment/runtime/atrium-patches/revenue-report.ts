import { BadRequestException } from "@nestjs/common";
export type Engagement = "retainer" | "hourly" | "flat_fee";
type Staff = {userId:string;allocatedMinutes:number;costRateCents:number};
type Entry = {userId:string;startedAt:Date;endedAt:Date|null;durationSec:number|null;billable:boolean;hourlyRateCents:number|null;invoiceLineItemId:string|null};
export type RevenueProject = {id:string;name:string;startDate:Date|null;endDate:Date|null;clients:string[];budget:{engagementType:Engagement;retainerCents:number;targetRateCents:number}|null;staff:Staff[];entries:Entry[]};
export function reportMonths(from:string,to:string) {
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(from)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(to)||from>to)throw new BadRequestException("Choose a valid month range");
 const months:string[]=[];const d=new Date(from+"-01T00:00:00Z");
 while(d.toISOString().slice(0,7)<=to){months.push(d.toISOString().slice(0,7));if(months.length>36)throw new BadRequestException("Choose at most 36 months");d.setUTCMonth(d.getUTCMonth()+1);}
 return months;
}
export function totals(rows:{revenueCents:number;expectedCostCents:number|null;actualCostCents:number|null;billedHours:number;actualHours:number}[]) {
 const revenueCents=rows.reduce((n,r)=>n+r.revenueCents,0);
 const expectedCostCents=rows.some(r=>r.expectedCostCents===null)?null:rows.reduce((n,r)=>n+r.expectedCostCents!,0);
 const actualCostCents=rows.some(r=>r.actualCostCents===null)?null:rows.reduce((n,r)=>n+r.actualCostCents!,0);
 return {revenueCents,expectedCostCents,actualCostCents,targetMarginPercent:revenueCents&&expectedCostCents!==null?(revenueCents-expectedCostCents)/revenueCents*100:null,actualMarginPercent:revenueCents&&actualCostCents!==null?(revenueCents-actualCostCents)/revenueCents*100:null,billedHours:rows.reduce((n,r)=>n+r.billedHours,0),actualHours:rows.reduce((n,r)=>n+r.actualHours,0)};
}
export function revenueReport(projects:RevenueProject[],from:string,to:string) {
 const months=reportMonths(from,to),rows:any[]=[],warnings:{projectId:string;projectName:string;reason:string}[]=[];
 for(const p of projects){
  const warn=(reason:string)=>warnings.push({projectId:p.id,projectName:p.name,reason});
  if(!p.budget){warn("Set an engagement budget to include this project.");continue;}
  if(!p.startDate){warn("Set a start date to include this project.");continue;}
  if(p.endDate&&p.endDate<p.startDate){warn("End date is before start date.");continue;}
  const b=p.budget,start=p.startDate.toISOString().slice(0,7),end=p.endDate?.toISOString().slice(0,7);
  const minutes=p.staff.reduce((n,s)=>n+s.allocatedMinutes,0);
  const blended=minutes?p.staff.reduce((n,s)=>n+s.allocatedMinutes*s.costRateCents,0)/minutes:null;
  for(const month of months){
   if(month<start||(end&&month>end))continue;
   const entries=p.entries.filter(e=>e.endedAt!==null&&e.startedAt.toISOString().slice(0,7)===month);
   const billed=entries.filter(e=>e.billable&&e.invoiceLineItemId!==null);
   const billedHours=billed.reduce((n,e)=>n+(e.durationSec??0)/3600,0);
   const revenueCents=b.engagementType==='hourly'?Math.round(billed.reduce((n,e)=>n+(e.durationSec??0)/3600*(e.hourlyRateCents??b.targetRateCents),0)):b.engagementType==='flat_fee'&&month!==start?0:b.retainerCents;
   const expectedHours=b.engagementType==='hourly'?billedHours:revenueCents/b.targetRateCents;
   const expectedCostCents=expectedHours===0?0:blended===null?null:Math.round(expectedHours*blended);
   let cost=0,uncostedHours=0,actualHours=0;
   for(const e of entries){const hours=(e.durationSec??0)/3600;actualHours+=hours;const rate=p.staff.find(s=>s.userId===e.userId)?.costRateCents;if(rate===undefined)uncostedHours+=hours;else cost+=hours*rate;}
   const actualCostCents=uncostedHours>0?null:Math.round(cost);
   rows.push({month,projectId:p.id,projectName:p.name,clients:p.clients,engagementType:b.engagementType,uncostedHours,...totals([{revenueCents,expectedCostCents,actualCostCents,billedHours,actualHours}])});
  }
 }
 rows.sort((a,b)=>a.month.localeCompare(b.month)||a.clients.join(', ').localeCompare(b.clients.join(', '))||a.projectName.localeCompare(b.projectName));
 return {from,to,rows,months:months.map(month=>({month,...totals(rows.filter(r=>r.month===month))})),totals:totals(rows),warnings};
}
