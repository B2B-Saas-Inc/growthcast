from pathlib import Path
import shutil
R=Path(__file__).resolve().parent
def replace(s,a,b):
 assert s.count(a)==1, 'File Library frontend context changed: '+a[:80]
 return s.replace(a,b)
def apply(web):
 src=web/'src'
 for name in ['library-ui.tsx','html-preview.tsx']:shutil.copyfile(R/name,src/'components'/name)
 p=src/'app/(dashboard)/dashboard/library/page.tsx';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('export {LibraryPage as default} from "@/components/library-ui";\n')
 p=src/'app/(dashboard)/sidebar-nav.tsx';s=p.read_text().replace('  LayoutDashboard,','  BookOpen,\n  LayoutDashboard,');s=replace(s,'  { href: "/dashboard/settings", label: "Settings", icon: Settings },','  { href: "/dashboard/library", label: "Library", icon: BookOpen },\n  { href: "/dashboard/settings", label: "Settings", icon: Settings },');p.write_text(s)
 p=src/'lib/status-colors.ts';s=p.read_text().replace('  pending:','  uploaded: {bg:"#e0f2fe",text:"#075985"},\n  pending:');p.write_text(s)
 p=src/'app/(dashboard)/dashboard/projects/[id]/components/files-section.tsx';s=p.read_text()
 s=s.replace('"use client";','"use client";\nimport {LibraryPicker} from "@/components/library-ui";\nimport {HtmlPreview,isHtmlFile} from "@/components/html-preview";',1)
 s=replace(s,'  const confirm = useConfirm();','  const [showLibrary,setShowLibrary]=useState(false);\n  const [htmlPreview,setHtmlPreview]=useState<{id:string;filename:string}|null>(null);\n  const confirm = useConfirm();')
 s=replace(s,'  const isPdf = docFile?.type === "application/pdf";','  const hasClientAction=requiresSignature||requiresApproval||docChoices.some(c=>c.trim());\n  const isPdf = docFile?.type === "application/pdf";')
 s=replace(s,'  const handleFileDownload = async (fileId: string, filename: string) => {','  const handleFileDownload = async (fileId: string, filename: string) => {\n    if(isHtmlFile(filename)){setHtmlPreview({id:fileId,filename});return;}')
 s=replace(s,'      if (andSend) {','      if (andSend && hasClientAction) {')
 s=replace(s,'success(andSend ? "Document uploaded and sent" : "Document saved as draft");','success(!hasClientAction ? "File uploaded" : andSend ? "Document uploaded and sent" : "Document saved as draft");')
 s=replace(s,'      if (reminderEnabled) {','      if (reminderEnabled && hasClientAction) {')
 s=replace(s,'      {/* Header with both upload actions */}','      {htmlPreview&&<HtmlPreview path={`/api/files/${htmlPreview.id}/download`} title={htmlPreview.filename} onClose={()=>setHtmlPreview(null)}/>}\n      {showLibrary&&<LibraryPicker projectId={projectId} onClose={()=>setShowLibrary(false)} onAdded={onFileChange}/>}\n      {/* Header with both upload actions */}')
 s=replace(s,'              Add\n','              Add files\n')
 marker='                <button\n                  onClick={() => { setShowAddMenu(false); setShowAddLink(true); }}'
 s=replace(s,marker,'                {canManageFiles&&<button onClick={()=>{setShowAddMenu(false);setShowLibrary(true);}} className="w-full px-3 py-2.5 text-left hover:bg-[var(--muted)]"><p className="text-sm font-medium">From Library</p><p className="text-xs text-[var(--muted-foreground)]">Share an SOP or reusable resource</p></button>}\n'+marker)
 a='<button onClick={() => handleDocUpload(false)}';s=replace(s,a,'{hasClientAction&&<button onClick={() => handleDocUpload(false)}')
 s=replace(s,'>Save Draft</button>','>Save Draft</button>}')
 s=replace(s,'onClick={() => handleDocUpload(true)}','onClick={() => handleDocUpload(hasClientAction)}')
 s=replace(s,'{docUploading ? "Uploading..." : "Upload & Send"}','{docUploading ? "Uploading..." : hasClientAction ? "Upload & Send" : "Upload file"}')
 s=replace(s,'Sending notifies the client immediately.','{hasClientAction ? "Sending notifies the client immediately." : "Uploads are available in project Files. No email or client action is requested."}')
 p.write_text(s)
 p=src/'app/(portal)/portal/projects/[id]/page.tsx';s=p.read_text().replace('"use client";','"use client";\nimport {HtmlPreview,isHtmlFile} from "@/components/html-preview";',1)
 # Hook must precede loading/not-found early returns.
 marker='  const [project, setProject]';assert marker in s;s=s.replace(marker,'  const [htmlPreview,setHtmlPreview]=useState<{id:string;filename:string}|null>(null);\n'+marker,1)
 s=replace(s,'  const handleDownload = async (fileId: string, filename: string) => {','  const handleDownload = async (fileId: string, filename: string) => {\n    if(isHtmlFile(filename)){setHtmlPreview({id:fileId,filename});return;}')
 s=replace(s,'      {/* Document Viewer Modal */}','      {htmlPreview&&<HtmlPreview path={`/api/files/${htmlPreview.id}/download`} title={htmlPreview.filename} onClose={()=>setHtmlPreview(null)}/>}\n      {/* Document Viewer Modal */}')
 s=replace(s,'const isReadOnly = isVoided || isExpired;','const isReadOnly = isVoided || isExpired || doc.status === "uploaded";')
 p.write_text(s)
