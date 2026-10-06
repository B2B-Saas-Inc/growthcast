from pathlib import Path
import shutil
R=Path(__file__).resolve().parent
def apply(web):
 src=web/'src'
 shutil.copyfile(R/'planning-ui.tsx',src/'components/planning-ui.tsx')
 p=src/'app/(dashboard)/dashboard/reports/capacity/page.tsx';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('export {CapacityPage as default} from "@/components/planning-ui";\n')
 p=src/'app/(dashboard)/dashboard/reports/layout.tsx';s=p.read_text();s=s.replace('const REPORTS: ReportTab[] = [','const REPORTS: ReportTab[] = [\n  { href: "/dashboard/reports/capacity", label: "Capacity" },');p.write_text(s)
 p=src/'app/(dashboard)/dashboard/projects/[id]/page.tsx';s=p.read_text();s='import {ProjectPlanning} from "@/components/planning-ui";\n'+s;s=s.replace('className="flex-1 min-w-0"','className="flex-1 min-w-0 w-full"');s=s.replace('const tabs = [','const tabs = [\n  { id: "planning", label: "Budget & team" },');s=s.replace('      {activeTab === "tasks" && (','      {activeTab === "planning" && <ProjectPlanning projectId={id} isArchived={isArchived} />}\n      {activeTab === "tasks" && (');s=s.replace('import {ProjectPlanning} from "@/components/planning-ui";\n"use client";','"use client";\nimport {ProjectPlanning} from "@/components/planning-ui";');p.write_text(s)
