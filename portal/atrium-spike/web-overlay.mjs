import { readFileSync,writeFileSync,mkdirSync,copyFileSync } from 'node:fs';
const root='/app/apps/web/src/app/(portal)';
mkdirSync(root+'/portal/documents',{recursive:true});
copyFileSync('/app/catalog-page.tsx',root+'/portal/documents/page.tsx');
const file=root+'/layout.tsx';
const source=readFileSync(file,'utf8').replace('px-6 py-4 flex items-center gap-3','px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3');
const marker='href="/portal/settings"';
if(source.split(marker).length!==2)throw Error('Pinned portal navigation changed');
// Add the review route without changing native project screens.
const position=source.lastIndexOf('<Link',source.indexOf(marker));
writeFileSync(file,source.slice(0,position)+'<Link href="/portal/documents" className="text-sm font-medium">Documents</Link>\n'+source.slice(position));
