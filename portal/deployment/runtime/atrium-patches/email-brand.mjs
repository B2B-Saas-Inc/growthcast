import {readFileSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
const root='/upstream/packages/email/src';
copyFileSync('/patches/email-brand.tsx',root+'/brand.tsx');
const files=readdirSync(root+'/templates').filter(f=>f.endsWith('.tsx'));
if(files.length!==14)throw Error('Email template inventory changed; review required');
for(const file of files){
 const path=root+'/templates/'+file;let s=readFileSync(path,'utf8');
 const replace=(before,after)=>{if(s.split(before).length!==2)throw Error('Email template patch context changed: '+file);s=s.replace(before,after);};
 s='import {BrandHead,BrandHeader,BrandFooter,brandBody,brandContainer} from "../brand";\n'+s;
 s=s.replace('  Head,\n','');replace('<Head />','<BrandHead/>');
 replace('<Body style={{ fontFamily: "sans-serif", padding: "40px 0" }}>','<Body style={brandBody}>');
 replace('<Container style={{ maxWidth: "480px", margin: "0 auto" }}>','<Container style={brandContainer}><BrandHeader/>');
 replace('</Container>','<BrandFooter/></Container>');
 s=s.replaceAll('3px solid #006b68','3px solid #ff6b4a').replaceAll('#006b68','#242426').replaceAll('#374151','#242426').replaceAll('#6b7280','#716d64').replaceAll('#f9fafb','#eee9df').replaceAll('borderRadius: "6px"','borderRadius: "2px"').replaceAll('borderRadius: "8px"','borderRadius: "2px"').replaceAll('Atrium','GrowthCast');
 writeFileSync(path,s);
}
const index=root+'/index.ts';writeFileSync(index,readFileSync(index,'utf8')+'\nexport {ConfigurationTestEmail} from "./brand";\n');
// Settings sends outside MailService, so its diagnostic email uses the same design.
const settings='/upstream/apps/api/src/settings/settings.service.ts';let s=readFileSync(settings,'utf8');
s='import {ConfigurationTestEmail} from "@atrium/email";\nimport {render} from "@react-email/render";\n'+s;
const html='`<p>This is a test email from GrowthCast to verify your email configuration is working correctly.</p><p>If you received this, your email settings are configured properly.</p>`';
if(s.split(html).length!==3)throw Error('Settings email patch context changed');s=s.replaceAll(html,'await render(ConfigurationTestEmail())');writeFileSync(settings,s);
const auth='/upstream/apps/api/src/auth/auth.service.ts';s=readFileSync(auth,'utf8').replaceAll('Reset your Atrium password','Reset your GrowthCast password').replaceAll('Sign in to Atrium','Sign in to GrowthCast');writeFileSync(auth,s);
copyFileSync('/patches/email-brand.spec.ts','/upstream/apps/api/src/email-brand.spec.ts');
