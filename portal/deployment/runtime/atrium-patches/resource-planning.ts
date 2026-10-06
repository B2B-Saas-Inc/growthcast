import {revenueReport, reportMonths} from "./revenue-report";
import { Body, Controller, Delete, Get, Injectable, Module, Param, Put, Query, UseGuards, BadRequestException, NotFoundException } from "@nestjs/common";
import { IsInt, Min, Max, IsOptional, Matches, IsIn } from "class-validator";
import { PrismaService } from "./prisma/prisma.service";
import { AuthGuard, RolesGuard, Roles, CurrentOrg } from "./common";

export class BudgetDto {
 @IsOptional() @IsIn(["retainer","hourly","flat_fee"]) engagementType?: string;
 @IsInt() @Min(0) @Max(1000000000) retainerCents!: number;
 @IsInt() @Min(1) @Max(100000000) targetRateCents!: number;
}
export class StaffDto {
 @IsInt() @Min(0) @Max(44640) allocatedMinutes!: number;
 @IsInt() @Min(0) @Max(100000000) costRateCents!: number;
}
export class CapacityDto {
 @IsInt() @Min(0) @Max(44640) capacityMinutes!: number;
 @IsInt() @Min(0) @Max(100000000) costRateCents!: number;
}
export class RevenueRangeDto {
 @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) from!: string;
 @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) to!: string;
}
export class MonthDto {
 @IsOptional() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month?: string;
}
export function monthBounds(month = new Date().toISOString().slice(0,7)) {
 if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException("Use a month in YYYY-MM format");
 const start = new Date(`${month}-01T00:00:00Z`);
 const end = new Date(start); end.setUTCMonth(end.getUTCMonth()+1);
 return {month,start,end};
}
export function budgetSummary(retainerCents: number, targetRateCents: number, staff: {allocatedMinutes:number;costRateCents:number}[]) {
 const allocatedMinutes = staff.reduce((n,s)=>n+s.allocatedMinutes,0);
 const plannedCostCents = Math.round(staff.reduce((n,s)=>n+s.allocatedMinutes*s.costRateCents/60,0));
 const blendedCostRateCents=allocatedMinutes>0?staff.reduce((n,s)=>n+s.allocatedMinutes*s.costRateCents,0)/allocatedMinutes:null;
 const expectedCostCents=blendedCostRateCents===null?null:Math.round(retainerCents/targetRateCents*blendedCostRateCents);
 return {blendedCostRateCents,expectedCostCents,expectedMarginPercent:expectedCostCents===null||retainerCents===0?null:(retainerCents-expectedCostCents)/retainerCents*100,includedHours:retainerCents/targetRateCents, allocatedHours:allocatedMinutes/60, remainingHours:retainerCents/targetRateCents-allocatedMinutes/60, plannedCostCents, plannedMarginCents:retainerCents-plannedCostCents};
}
export function costSummary(entries:{userId:string;seconds:number}[],staff:{userId:string;costRateCents:number}[],retainerCents?:number) {
 let actualCostCents=0,uncostedSeconds=0,totalSeconds=0;
 for(const e of entries) { totalSeconds+=e.seconds; const rate=staff.find(s=>s.userId===e.userId)?.costRateCents;
  if(rate===undefined) uncostedSeconds+=e.seconds; else actualCostCents+=e.seconds*rate/3600;
 }
 actualCostCents=Math.round(actualCostCents);
 return {actualHours:totalSeconds/3600,actualCostCents,uncostedHours:uncostedSeconds/3600,actualMarginCents:retainerCents===undefined||uncostedSeconds>0?null:retainerCents-actualCostCents,actualMarginPercent:!retainerCents||uncostedSeconds>0?null:(retainerCents-actualCostCents)/retainerCents*100,effectiveBillingRateCents:totalSeconds>0&&retainerCents!==undefined?retainerCents/(totalSeconds/3600):null};
}
@Injectable()
export class ResourcePlanningService {
 constructor(private prisma: PrismaService) {}
 async project(org:string,id:string,write=false) {
  const p=await this.prisma.project.findFirst({where:{id,organizationId:org}});
  if(!p) throw new NotFoundException("Project not found");
  if(write && p.archivedAt) throw new BadRequestException("Unarchive the project before editing its plan");
  return p;
 }
 async member(org:string,id:string) {
  const m=await this.prisma.member.findFirst({where:{id,organizationId:org,role:{in:["owner","admin"]}}});
  if(!m) throw new NotFoundException("Team member not found");
  return m;
 }
 async getProject(org:string,id:string,month?:string) {
  const project=await this.project(org,id);
  const budgets=await this.prisma.$queryRaw<any[]>`SELECT * FROM gc_atrium.project_budget WHERE "projectId"=${id}`;
  const staff=await this.prisma.$queryRaw<any[]>`SELECT s.*,m."userId",u.name,u.email FROM gc_atrium.project_staff s JOIN gc_atrium.member m ON m.id=s."memberId" JOIN gc_atrium."user" u ON u.id=m."userId" WHERE s."projectId"=${id} AND m."organizationId"=${org} AND m.role IN ('owner','admin') ORDER BY u.name,m.id`;
  const b=budgets[0]??null;
  const {start,end,month:selected}=monthBounds(month);
  const entries=await this.prisma.timeEntry.groupBy({by:["userId"],where:{organizationId:org,projectId:id,startedAt:{gte:start,lt:end},endedAt:{not:null}},_sum:{durationSec:true}});
  const revenue=b ? (await this.revenue(org,selected,selected)).rows.find((r:any)=>r.projectId===id) : null;
  const actual=costSummary(entries.map(e=>({userId:e.userId,seconds:e._sum.durationSec??0})),staff,revenue?.revenueCents);
  return {month:selected,revenue:revenue??null,budget:b,staff:staff.map(s=>({...s,actualHours:(entries.find(e=>e.userId===s.userId)?._sum.durationSec??0)/3600})),summary:b?budgetSummary(b.retainerCents,b.targetRateCents,staff):null,actual};
 }
 async setBudget(org:string,id:string,d:BudgetDto) {
  await this.project(org,id,true);
  await this.prisma.$executeRaw`INSERT INTO gc_atrium.project_budget ("projectId","retainerCents","targetRateCents","engagementType") VALUES (${id},${d.retainerCents},${d.targetRateCents},${d.engagementType??"retainer"}) ON CONFLICT ("projectId") DO UPDATE SET "retainerCents"=EXCLUDED."retainerCents","targetRateCents"=EXCLUDED."targetRateCents","engagementType"=EXCLUDED."engagementType","updatedAt"=now()`;
  return this.getProject(org,id);
 }
 async setStaff(org:string,id:string,memberId:string,d:StaffDto) {
  await this.project(org,id,true); await this.member(org,memberId);
  await this.prisma.$executeRaw`INSERT INTO gc_atrium.project_staff ("projectId","memberId","allocatedMinutes","costRateCents") VALUES (${id},${memberId},${d.allocatedMinutes},${d.costRateCents}) ON CONFLICT ("projectId","memberId") DO UPDATE SET "allocatedMinutes"=EXCLUDED."allocatedMinutes","costRateCents"=EXCLUDED."costRateCents","updatedAt"=now()`;
  return this.getProject(org,id);
 }
 async removeStaff(org:string,id:string,memberId:string) {
  await this.project(org,id,true);
  await this.prisma.$executeRaw`DELETE FROM gc_atrium.project_staff WHERE "projectId"=${id} AND "memberId"=${memberId}`;
  return this.getProject(org,id);
 }
 async setCapacity(org:string,id:string,d:CapacityDto) {
  await this.member(org,id);
  await this.prisma.$executeRaw`INSERT INTO gc_atrium.member_capacity ("memberId","capacityMinutes","costRateCents") VALUES (${id},${d.capacityMinutes},${d.costRateCents}) ON CONFLICT ("memberId") DO UPDATE SET "capacityMinutes"=EXCLUDED."capacityMinutes","costRateCents"=EXCLUDED."costRateCents","updatedAt"=now()`;
  return {saved:true};
 }
 async revenue(org:string,from:string,to:string) {
  reportMonths(from,to);
  const start=monthBounds(from).start,end=monthBounds(to).end;
  const projects=await this.prisma.project.findMany({where:{organizationId:org},include:{clients:{include:{user:{select:{name:true}}}}}});
  const budgets=await this.prisma.$queryRaw<any[]>`SELECT b.* FROM gc_atrium.project_budget b JOIN gc_atrium.project p ON p.id=b."projectId" WHERE p."organizationId"=${org}`;
  const staff=await this.prisma.$queryRaw<any[]>`SELECT s.*,m."userId" FROM gc_atrium.project_staff s JOIN gc_atrium.project p ON p.id=s."projectId" JOIN gc_atrium.member m ON m.id=s."memberId" WHERE p."organizationId"=${org} AND m."organizationId"=${org} AND m.role IN ('owner','admin')`;
  const entries=await this.prisma.timeEntry.findMany({where:{organizationId:org,startedAt:{gte:start,lt:end},endedAt:{not:null}},select:{projectId:true,userId:true,startedAt:true,endedAt:true,durationSec:true,billable:true,hourlyRateCents:true,invoiceLineItemId:true}});
  return revenueReport(projects.map(p=>({...p,clients:p.clients.map(c=>c.user.name),budget:budgets.find(b=>b.projectId===p.id)??null,staff:staff.filter(s=>s.projectId===p.id),entries:entries.filter(e=>e.projectId===p.id)})),from,to);
 }
 async capacity(org:string,month?:string) {
  const {start,end,month:selected}=monthBounds(month);
  const members=await this.prisma.$queryRaw<any[]>`SELECT m.id,m."userId",u.name,u.email,c."capacityMinutes",c."costRateCents" FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId" LEFT JOIN gc_atrium.member_capacity c ON c."memberId"=m.id WHERE m."organizationId"=${org} AND m.role IN ('owner','admin') ORDER BY u.name,m.id`;
  const assignments=await this.prisma.$queryRaw<any[]>`SELECT s.*,p.name AS "projectName",p."organizationId" FROM gc_atrium.project_staff s JOIN gc_atrium.project p ON p.id=s."projectId" JOIN gc_atrium.member m ON m.id=s."memberId" WHERE p."organizationId"=${org} AND m."organizationId"=${org} AND m.role IN ('owner','admin') AND p."archivedAt" IS NULL AND p.status <> 'completed'`;
  const actuals=await this.prisma.timeEntry.groupBy({by:["userId","projectId"],where:{organizationId:org,startedAt:{gte:start,lt:end},endedAt:{not:null}},_sum:{durationSec:true}});
  return {month:selected,members:members.map(m=>{
   const assigned=assignments.filter(a=>a.memberId===m.id);
   const planned=assigned.reduce((n,a)=>n+a.allocatedMinutes,0);
   const seconds=actuals.filter(a=>a.userId===m.userId).reduce((n,a)=>n+(a._sum.durationSec??0),0);
   return {...m,allocatedHours:planned/60,actualHours:seconds/3600,availableHours:m.capacityMinutes===null?null:(m.capacityMinutes-planned)/60,plannedUtilization:m.capacityMinutes>0?planned/m.capacityMinutes*100:null,actualUtilization:m.capacityMinutes>0?seconds/(m.capacityMinutes*60)*100:null,assignments:assigned.map(a=>({...a,actualHours:(actuals.find(t=>t.userId===m.userId&&t.projectId===a.projectId)?._sum.durationSec??0)/3600}))};
  })};
 }
}
@Controller("resource-planning")
@UseGuards(AuthGuard,RolesGuard)
@Roles("owner","admin")
export class ResourcePlanningController {
 constructor(private service:ResourcePlanningService) {}
 @Get("revenue") revenue(@CurrentOrg("id") org:string,@Query() q:RevenueRangeDto) {return this.service.revenue(org,q.from,q.to);}
 @Get("capacity") capacity(@CurrentOrg("id") org:string,@Query() q:MonthDto) {return this.service.capacity(org,q.month);}
 @Put("members/:id") member(@CurrentOrg("id") org:string,@Param("id") id:string,@Body() d:CapacityDto) {return this.service.setCapacity(org,id,d);}
 @Get("projects/:id") project(@CurrentOrg("id") org:string,@Param("id") id:string,@Query() q:MonthDto) {return this.service.getProject(org,id,q.month);}
 @Put("projects/:id/budget") budget(@CurrentOrg("id") org:string,@Param("id") id:string,@Body() d:BudgetDto) {return this.service.setBudget(org,id,d);}
 @Put("projects/:id/staff/:memberId") staff(@CurrentOrg("id") org:string,@Param("id") id:string,@Param("memberId") memberId:string,@Body() d:StaffDto) {return this.service.setStaff(org,id,memberId,d);}
 @Delete("projects/:id/staff/:memberId") remove(@CurrentOrg("id") org:string,@Param("id") id:string,@Param("memberId") memberId:string) {return this.service.removeStaff(org,id,memberId);}
}
@Module({controllers:[ResourcePlanningController],providers:[ResourcePlanningService]})
export class ResourcePlanningModule {}
