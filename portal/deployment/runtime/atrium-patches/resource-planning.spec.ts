import "reflect-metadata";
import {describe,it,expect} from "bun:test";
import {validate} from "class-validator";
import {BudgetDto,StaffDto,CapacityDto,monthBounds,budgetSummary,costSummary,ResourcePlanningService,ResourcePlanningController} from "./resource-planning";
import {ROLES_KEY} from "./common/decorators/roles.decorator";
describe("internal resource planning",()=>{
 it("calculates the requested retainer example without rounding included hours",()=>{
  const b=budgetSummary(400000,21800,[{allocatedMinutes:1101,costRateCents:10900}]);
  expect(b.includedHours).toBeCloseTo(18.34862385,7);
  expect(b.plannedCostCents).toBe(200015); expect(b.expectedCostCents).toBe(200000); expect(b.expectedMarginPercent).toBe(50);
  const a=costSummary([{userId:"staff",seconds:54000}],[{userId:"staff",costRateCents:10900}],400000);
  expect(a.actualCostCents).toBe(163500); expect(a.actualMarginPercent).toBeCloseTo(59.125,8);
 });
 it("does not invent a margin when time lacks a cost rate",()=>{
  const a=costSummary([{userId:"other",seconds:3600}],[],400000);
  expect(a.uncostedHours).toBe(1); expect(a.actualMarginPercent).toBeNull();
 });
 it("handles zero retainer and explicit zero cost without division by zero",()=>{
  const a=costSummary([{userId:"staff",seconds:3600}],[{userId:"staff",costRateCents:0}],0);
  expect(a.uncostedHours).toBe(0);expect(a.actualMarginPercent).toBeNull();
 });
 it("uses an exclusive UTC month boundary including leap years",()=>{
  expect(monthBounds("2028-02").end.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  expect(()=>monthBounds("2026-13")).toThrow();
 });
 it("rejects zero billing rate, negative and fractional cents, and impossible capacity",async()=>{
  for(const [Type,data] of [[BudgetDto,{retainerCents:0,targetRateCents:0}],[BudgetDto,{retainerCents:1.2,targetRateCents:1}],[StaffDto,{allocatedMinutes:-1,costRateCents:0}],[CapacityDto,{capacityMinutes:44641,costRateCents:0}]] as const) expect((await validate(Object.assign(new Type(),data))).length).toBeGreaterThan(0);
 });
 it("protects every route at controller level from clients",()=>expect(Reflect.getMetadata(ROLES_KEY,ResourcePlanningController)).toEqual(["owner","admin"]));
 it("denies foreign projects before querying internal data",async()=>{
  let queried=false;
  const service=new ResourcePlanningService({project:{findFirst:async({where}:any)=>{expect(where.organizationId).toBe("org");return null;}},$queryRaw:()=>{queried=true;}} as any);
  await expect(service.getProject("org","foreign")).rejects.toThrow("Project not found");expect(queried).toBe(false);
 });
 it("denies client and foreign staff assignments before writing",async()=>{
  let wrote=false;
  const service=new ResourcePlanningService({project:{findFirst:async()=>({id:"p"})},member:{findFirst:async({where}:any)=>{expect(where).toEqual({id:"m",organizationId:"org",role:{in:["owner","admin"]}});return null;}},$executeRaw:()=>{wrote=true;}} as any);
  await expect(service.setStaff("org","p","m",{allocatedMinutes:60,costRateCents:100})).rejects.toThrow("Team member not found");expect(wrote).toBe(false);
 });
});
