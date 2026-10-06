"""Apply the observed GrowthCast design without changing the pinned checkout."""
import shutil,re
from pathlib import Path
R=Path(__file__).resolve().parent
ASSETS=R/'assets'
def apply(web):
 src=web/'src';public=web/'public'
 shutil.copyfile(R/'growthcast-wordmark.png',public/'growthcast-wordmark.png')
 shutil.copyfile(ASSETS/'growthcast-logo.svg',public/'growthcast-favicon.svg')
 shutil.copyfile(R/'growthcast-favicon-v2.jpg',public/'growthcast-favicon-v2.jpg')
 (public/'fonts').mkdir(exist_ok=True)
 for p in (ASSETS/'fonts').glob('*.ttf'):shutil.copyfile(p,public/'fonts'/p.name)
 shutil.copyfile(R/'wordmark.tsx',src/'components/growthcast-wordmark.tsx')
 shutil.copyfile(R/'auth-layout.tsx',src/'app/(auth)/layout.tsx')
 p=src/'app/globals.css';p.write_text(p.read_text()+'\n'+(R/'growthcast.css').read_text())
 p=src/'app/layout.tsx';s=p.read_text().replace('<body suppressHydrationWarning>','<body className="gc-portal" suppressHydrationWarning>').replace('title: "Growthcast",','title: "GrowthCast | Client Portal",\n  icons: {icon:{url:"/growthcast-favicon-v2.jpg",type:"image/jpeg",sizes:"500x500"},shortcut:"/growthcast-favicon-v2.jpg"},');p.write_text(s)
 p=src/'app/providers.tsx';s=p.read_text().replace('defaultTheme="system" enableSystem','defaultTheme="light" forcedTheme="light" enableSystem={false}');p.write_text(s)
 for p in src.rglob('*.tsx'):
  s=p.read_text().replace('"/icon.png"','"/growthcast-favicon.svg"').replace('<ThemeToggle />','').replace('logoSrc || "/growthcast-favicon.svg"','"/growthcast-favicon.svg"').replace('Sign in to Atrium','Sign in to GrowthCast').replace('Sign up for Atrium','Sign up for GrowthCast')
  p.write_text(s)
 p=src/'app/(auth)/login/page.tsx';s=p.read_text().replace('hideLogo={branding?.hideLogo}','hideLogo={true}');p.write_text(s)
 p=src/'app/(auth)/login/login-form.tsx';s=p.read_text().replace('{orgName ? `Sign in to ${orgName}` : "Sign in to GrowthCast"}','Welcome back.');p.write_text(s)
 p=src/'components/org-switcher.tsx';s=p.read_text();start=s.index('  const label = (');end=s.index('  if (!canSwitch)',start);s=s[:start]+'  const label = <GrowthcastWordmark />;\n\n'+s[end:];s=s.replace('import { useEffect','import {GrowthcastWordmark} from "@/components/growthcast-wordmark";\nimport { useEffect',1);p.write_text(s)
 p=src/'app/(dashboard)/mobile-nav.tsx';s=p.read_text();start=s.index('        {!hideLogo && (');end=s.index('        <div className="ml-auto',start);s=s[:start]+'        <GrowthcastWordmark />\n'+s[end:];s=s.replace('import ', 'import {GrowthcastWordmark} from "@/components/growthcast-wordmark";\nimport ',1);p.write_text(s)
 p=src/'app/(portal)/layout.tsx';s=p.read_text();start=s.index('            {!branding?.hideLogo');end=s.index('            <Link',start);s=s[:start]+'            <GrowthcastWordmark /><div className="flex-1" />\n'+s[end:];s='import {GrowthcastWordmark} from "@/components/growthcast-wordmark";\n'+s;p.write_text(s)

 p=src/'app/page.tsx';s=p.read_text();s='import {GrowthcastWordmark} from "@/components/growthcast-wordmark";\n'+s
 start=s.index('          <img ');end=s.index('        </h1>',start)
 s=s[:start]+'          <GrowthcastWordmark />\n'+s[end:]
 s=s.replace('The open-source client portal for agencies and freelancers.','Your projects, conversations, and next steps. All together with your GrowthCast team.')
 p.write_text(s)
