from pathlib import Path
import shutil
R=Path(__file__).resolve().parent
def apply(web):
 src=web/'src'
 shutil.copyfile(R/'revenue-ui.tsx',src/'components/revenue-ui.tsx')
 p=src/'app/(dashboard)/dashboard/reports/revenue/page.tsx';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('export {RevenuePage as default} from "@/components/revenue-ui";\n')
 p=src/'app/(dashboard)/dashboard/reports/layout.tsx';s=p.read_text().replace('const REPORTS: ReportTab[] = [','const REPORTS: ReportTab[] = [\n  { href: "/dashboard/reports/revenue", label: "Monthly revenue" },');p.write_text(s)
 p=src/'app/(dashboard)/dashboard/settings/layout.tsx';s=p.read_text()
 for name in ['Organizations','Billing']:
  line=next(line for line in s.splitlines(True) if 'label: "'+name+'"' in line);s=s.replace(line,'')
 p.write_text(s)
 for name in ['organizations','billing']:
  p=src/f'app/(dashboard)/dashboard/settings/{name}/page.tsx';p.write_text('import {redirect} from "next/navigation";\nexport default function Page(){redirect("/dashboard/settings/workspace");}\n')
 p=src/'app/(dashboard)/dashboard/settings/general/general-section.tsx';s=p.read_text();s=s.replace('import { CustomDomainSection } from "../system/custom-domain-section";\n','');start=s.index('      <section className="space-y-4 py-8">',s.index('</form>'));end=s.index('      </section>',start)+len('      </section>');assert 'CustomDomainSection' in s[start:end];s=s[:start]+s[end:];p.write_text(s)
 p=src/'components/planning-ui.tsx';s=p.read_text()
 s=s.replace('type Plan={budget:{retainerCents:number;targetRateCents:number}', 'type Plan={revenue:{revenueCents:number;expectedCostCents:number|null;actualCostCents:number|null;targetMarginPercent:number|null;actualMarginPercent:number|null}|null;budget:{retainerCents:number;targetRateCents:number;engagementType:"retainer"|"hourly"|"flat_fee"}')
 s=s.replace('const [retainer,setRetainer]=useState("");','const [engagement,setEngagement]=useState("retainer");const [retainer,setRetainer]=useState("");')
 s=s.replace('setPlan(p);setMembers(c.members);','setPlan(p);setMembers(c.members);setEngagement(p.budget?.engagementType??"retainer");')
 s=s.replace('Internal only · recurring monthly plan · USD','Internal only · engagement budget and monthly staffing · USD')
 s=s.replace('{retainerCents:Math.round(Number(retainer)*100),targetRateCents:', '{engagementType:engagement,retainerCents:engagement==="hourly"?0:Math.round(Number(retainer)*100),targetRateCents:')
 s=s.replace('<h3 className="font-semibold">Monthly retainer</h3>','<h3 className="font-semibold">Engagement budget</h3>')
 s=s.replace('<Field label="Retainer ($/month)" value={retainer} onChange={setRetainer} max={10000000}/>', '<label className="text-sm space-y-1"><span>Engagement type</span><select aria-label="Engagement type" className={input} value={engagement} onChange={e=>setEngagement(e.target.value)}><option value="retainer">Monthly retainer</option><option value="hourly">Hourly</option><option value="flat_fee">Flat fee</option></select></label>{engagement!=="hourly"&&<Field label={engagement==="flat_fee"?"Flat fee ($)":"Retainer ($/month)"} value={retainer} onChange={setRetainer} max={10000000}/>}')
 s=s.replace('{Number(rate)>0&&retainer!==""&&','{engagement!=="hourly"&&Number(rate)>0&&retainer!==""&&').replace('hours/month</strong>', 'hours{engagement==="flat_fee"?" total":"/month"}</strong>')
 s=s.replace('  </form>\n  <div className="grid grid-cols-2', '   <p className="text-xs text-[var(--muted-foreground)]">{engagement==="flat_fee"?"The fee is counted once in the project start month. Set dates in Project settings.":engagement==="hourly"?"Revenue uses completed hours attached to an invoice. This rate is the default for new time entries; existing entries keep their saved rates.":"The retainer is counted from the project start month through the end month."} <Link className="underline" href="/dashboard/reports/revenue">Monthly revenue report →</Link></p>\n  </form>\n  <div className="grid grid-cols-2',1)
 s=s.replace('label="Included hours / month" value={num(s?.includedHours)}','label={engagement==="flat_fee"?"Included hours / engagement":"Included hours / month"} value={engagement==="hourly"?"As billed":num(s?.includedHours)}')
 s=s.replace('value={num(s?.remainingHours)}','value={engagement==="hourly"?"—":num(s?.remainingHours)}')
 s=s.replace('label="Expected cost at included hours" value={money(s?.expectedCostCents)} note="Included hours × weighted team cost rate"','label="Expected cost for month" value={money(plan.revenue?.expectedCostCents)} note="Report revenue basis × weighted team cost rate"')
 s=s.replace('value={money(a?.actualCostCents)}','value={a?.uncostedHours?"Incomplete":money(a?.actualCostCents)}')
 s=s.replace('s?.expectedCostCents!=null&&a&&a.uncostedHours===0?money(s.expectedCostCents-a.actualCostCents)','plan.revenue?.expectedCostCents!=null&&a&&a.uncostedHours===0?money(plan.revenue.expectedCostCents-a.actualCostCents)')
 s=s.replace('percent(s?.expectedMarginPercent)','percent(plan.revenue?.targetMarginPercent)').replace('note="Monthly retainer ÷ logged hours"','note="Selected month revenue ÷ logged hours"')
 old='Expected cost uses the weighted cost rate of allocated team hours at the full retainer hour allowance.'
 s=s.replace(old,'Expected cost follows the monthly revenue report: the retainer each active month, flat fee only in the start month, or invoiced hours for hourly work. Projects need a start date and budget for revenue and margin calculations.')
 s=s.replace('historical months are compared against the current recurring plan.','historical months use current engagement settings. Team allocations remain monthly for all engagement types.')
 p.write_text(s)
