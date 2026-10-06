"""Project settings layout overlay; existing action/confirmation behavior is preserved."""
from pathlib import Path

def apply(web):
 p=web/'src/app/(dashboard)/dashboard/projects/[id]/page.tsx';s=p.read_text()
 # Move the complete date editor/countdown and delete control out of the sidebar.
 start=s.index('      <div className="space-y-2 pt-4">\n        <h2')
 rate=s.index('      {(currentRole === "owner" || currentRole === "admin") && (\n        <div id="default-rate"',start)
 timeline=s[start:rate]
 delete=s.index('      {isOwner && (',rate);end=s.index('    </>\n  );',delete)
 deletion=s[delete:end]
 s=s[:start]+s[end:]
 start=s.index('          <div className="shrink-0 flex items-center gap-1.5">')
 end=s.index('          </div>\n        </div>\n        {project.description',start)+len('          </div>')
 actions=s[start:end].replace('className="shrink-0 flex items-center gap-1.5"','className="flex flex-wrap items-center gap-2"')
 settings='''          <details className="relative shrink-0" onKeyDown={(event) => {
            if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
          }}>
            <summary aria-label="Project settings" className="cursor-pointer list-none rounded border border-[var(--border)] p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] [&::-webkit-details-marker]:hidden">
              <Settings size={16} aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-[min(320px,calc(100vw-32px))] space-y-4 rounded border border-[var(--border)] bg-[var(--background)] p-4 shadow-lg" data-testid="project-settings-panel">
              <h2 className="font-semibold text-sm">Project settings</h2>
'''+timeline+actions+deletion+'''            </div>
          </details>'''
 s=s[:start]+settings+s[end:]
 s=s.replace('Archive, ArchiveRestore, Trash2, Calendar, ChevronDown, Tag, Copy','Archive, ArchiveRestore, Trash2, Calendar, ChevronDown, Tag, Copy, Settings')
 # The budget tab is the single visible planning-rate editor; preserve saved invoice data.
 start=s.index('  const handleRateChange = ');end=s.index('\n  const ',start+3);s=s[:start]+s[end:]
 p.write_text(s)
