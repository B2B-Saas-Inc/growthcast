"""Candidate-only UI overlay; deliberately not invoked by the live web builder."""
from pathlib import Path
import shutil,json
R=Path(__file__).resolve().parent
def apply(web):
 src=web/'src';shutil.copy2(R/'catalog-actions.tsx',src/'components/guest-catalog-actions.tsx');shutil.copy2(R/'send.tsx',src/'components/guest-document-send.tsx');shutil.copy2(R/'fields.tsx',src/'components/guest-signing-fields.tsx');shutil.copy2(R/'review.tsx',src/'components/guest-document-review.tsx');shutil.copy2(R/'documents.tsx',src/'components/guest-documents.tsx')
 page=src/'app/(dashboard)/dashboard/documents/page.tsx';page.parent.mkdir(parents=True,exist_ok=True)
 assert not page.exists(),'Existing document route requires explicit integration'
 page.write_text('export {GuestDocumentsPage as default} from "@/components/guest-documents";\n')
 shutil.copy2(R/'overview.tsx',src/'components/workspace-overview.tsx')
 (src/'app/(dashboard)/dashboard/page.tsx').write_text('export {OverviewPage as default} from "@/components/workspace-overview";\n')
 p=src/'app/(dashboard)/sidebar-nav.tsx';s=p.read_text();s=s.replace('  BookOpen,','  FileText,\n  BookOpen,')
 anchor='  { href: "/dashboard/library", label: "Library", icon: BookOpen },';assert s.count(anchor)==1
 s=s.replace(anchor,'  { href: "/dashboard/documents", label: "Documents", icon: FileText },\n'+anchor);p.write_text(s)

 p=src/'lib/api.ts';s=p.read_text();needle='if (!(options.body instanceof FormData)) {';assert s.count(needle)==1
 s=s.replace(needle,'if (!(options.body instanceof FormData) && !(options.body instanceof Blob)) {');p.write_text(s)

 (web/'copy-guest-pdf-worker.cjs').write_text('const fs=require("fs");fs.copyFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs",{paths:[require.resolve("react-pdf")]}),"public/guest-pdf.worker.mjs");\n')
 p=web/'package.json';package=json.loads(p.read_text());package['scripts']['build']='bun copy-guest-pdf-worker.cjs && '+package['scripts']['build'];p.write_text(json.dumps(package,indent=2)+'\n')
