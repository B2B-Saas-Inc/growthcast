"""Produce a credential-free frontend context from the pinned tracked source."""
import json,subprocess,sys,tarfile,io,shutil,hashlib
from brand.apply import apply as apply_brand
from pathlib import Path
R=Path(__file__).resolve().parent
UP=R.parent.parent/'checkouts/atrium'
REV='1a94a30b9aabe0e2d444c9239c4898d18b0dd5e2'
def prepare(target):
 assert subprocess.check_output(['git','-C',str(UP),'rev-parse','HEAD'],text=True).strip()==REV
 assert subprocess.run(['git','-C',str(UP),'diff','--quiet','HEAD']).returncode==0
 target=Path(target);target.mkdir(parents=True,exist_ok=True);assert not list(target.iterdir())
 archive=subprocess.check_output(['git','-C',str(UP),'archive',REV])
 with tarfile.open(fileobj=io.BytesIO(archive)) as tf:tf.extractall(target,filter='data')
 web=target/'apps/web';src=web/'src';lib=src/'lib/growthcast';lib.mkdir()
 shutil.copyfile(R.parent/'vercel-api-proxy.mjs',lib/'vercel-api-proxy.mjs')
 (lib/'runtime.mjs').write_text((R.parent/'proxy-secret/runtime.mjs').read_text().replace("'../vercel-api-proxy.mjs'","'./vercel-api-proxy.mjs'"))
 shutil.copyfile(R/'server-api.ts',src/'lib/server-api.ts')
 route=src/'app/api/[...path]';route.mkdir(parents=True)
 (route/'route.js').write_text((R.parent/'web-proxy/app/api/[...path]/route.js').read_text().replace("'../../../lib/runtime.mjs'","'../../../lib/growthcast/runtime.mjs'"))
 server_files=['lib/auth.ts','lib/branding.ts','app/(dashboard)/layout.tsx','app/(portal)/layout.tsx','app/(setup)/layout.tsx']
 for name in server_files:
  p=src/name;s=p.read_text();assert 'fetch(' in s
  s='import {portalFetch as fetch} from "@/lib/server-api";\n'+s
  s=s.replace('process.env.API_URL || "http://localhost:3001"','process.env.PORTAL_WEB_URL || ""')
  p.write_text(s)
 # Client requests use the canonical same-origin proxy, never localhost/API origin.
 for p in src.rglob('*.tsx'):
  s=p.read_text();s=s.replace('process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"','process.env.NEXT_PUBLIC_API_URL || ""');p.write_text(s)
 p=src/'app/layout.tsx';s=p.read_text().replace('title: "Atrium"','title: "Growthcast"');s='export const dynamic = "force-dynamic";\n'+s;p.write_text(s)
 # Prevent custom-host routing on arbitrary preview URLs; use only canonical staging.
 (src/'middleware.ts').write_text('''import {NextRequest, NextResponse} from 'next/server';
export function middleware(request: NextRequest) {
 const canonical=process.env.PORTAL_WEB_URL;
 if(!canonical || request.nextUrl.origin!==canonical)return new NextResponse('Unavailable',{status:404});
 const headers=new Headers(request.headers);headers.delete('x-custom-host');
 return NextResponse.next({request:{headers}});
}
export const config={matcher:['/((?!_next|favicon.ico).*)']};
''')
 config=web/'next.config.ts';s=config.read_text();s=s.replace('const nextConfig: NextConfig = {','const nextConfig: NextConfig = {\n  poweredByHeader: false,');s=s.replace('headers: [','headers: [\n          {key:"X-Robots-Tag",value:"noindex, nofollow"},\n          {key:"Referrer-Policy",value:"no-referrer"},\n          {key:"Cache-Control",value:"private, no-store"},',1);config.write_text(s)
 (web/'vercel.json').write_text(json.dumps({'framework':'nextjs','regions':['iad1'],'installCommand':'cd ../.. && bun install --frozen-lockfile --ignore-scripts','buildCommand':'bun run build'})+'\n')
 # Remove irrelevant source trees before uploading; retain locked workspace manifests.
 for p in target.rglob('.env*'):
  if p.is_file():p.unlink()
 # GET profile includes identity/timestamps; PUT accepts only editable DTO fields.
 p=src/'app/(portal)/portal/settings/page.tsx';s=p.read_text()
 old='body: JSON.stringify(profile),'
 assert s.count(old)==1,'Pinned client profile form changed'
 s=s.replace(old,'body: JSON.stringify({\n          company: profile.company ?? "",\n          phone: profile.phone ?? "",\n          address: profile.address ?? "",\n          website: profile.website ?? "",\n          description: profile.description ?? "",\n        }),')
 p.write_text(s)
 # Gate pages for pre-existing unverified sessions; the API enforces the same boundary.
 for name in ['app/(portal)/layout.tsx','app/(dashboard)/layout.tsx','app/(setup)/layout.tsx']:
  p=src/name;s=p.read_text();marker='  if (!session) {\n    redirect("/login");\n  }'
  assert marker in s
  s=s.replace(marker,marker+'\n  if (session.user.emailVerified !== true) redirect("/verify-email");');p.write_text(s)
 for name in ['accept-invite','verify-email']:
  shutil.copyfile(R/'verified-access'/f'{name}.tsx',src/'app/(auth)'/name/'page.tsx')
 p=src/'app/(dashboard)/dashboard/settings/general/general-section.tsx';s=p.read_text().replace('Configure how Atrium sends emails','Configure how GrowthCast sends emails');p.write_text(s)
 import importlib.util
 spec=importlib.util.spec_from_file_location("planning",R.parent/"resource-planning/prepare.py");planning=importlib.util.module_from_spec(spec);spec.loader.exec_module(planning);planning.apply(web)
 spec=importlib.util.spec_from_file_location("project_polish",R.parent/"project-polish/prepare.py");polish=importlib.util.module_from_spec(spec);spec.loader.exec_module(polish);polish.apply(web)
 spec=importlib.util.spec_from_file_location("payment_options",R.parent/"payment-options/prepare.py");payment_options=importlib.util.module_from_spec(spec);spec.loader.exec_module(payment_options);payment_options.apply(web)
 spec=importlib.util.spec_from_file_location("revenue_report",R.parent/"revenue-report/prepare.py");revenue_report=importlib.util.module_from_spec(spec);spec.loader.exec_module(revenue_report);revenue_report.apply(web)
 spec=importlib.util.spec_from_file_location("file_library",R.parent/"file-library/prepare.py");file_library=importlib.util.module_from_spec(spec);spec.loader.exec_module(file_library);file_library.apply(web)
 apply_brand(web)
 paths=[p for p in web.rglob('*') if p.is_file()]
 return {'upstreamRevision':REV,'serverPatchedFiles':server_files,'webFiles':{str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
if __name__=='__main__':
 r=prepare(sys.argv[1]);(R/'source-evidence.json').write_text(json.dumps(r,indent=2)+'\n');print('Pinned frontend packaged with same-origin client proxy and server-only API boundary.')
