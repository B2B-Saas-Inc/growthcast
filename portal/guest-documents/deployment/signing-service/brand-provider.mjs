// Apply only the dedicated staging signing team's recipient-facing branding.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync,rmSync} from 'node:fs';
import {runtimeConfig,verifyRuntime} from '/boundary/deployment/runtime/config.mjs';
import {validateConnection} from '/boundary/deployment/runtime-connections/deliver.mjs';
import {guard} from '/boundary/deployment/supabase/managed-documenso/migrate.mjs';
const require=createRequire('/boundary/package.json'),{Client}=require('pg');let prisma;
try{
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const {connection}=JSON.parse(input);input='';assert.equal(process.getuid(),1001);validateConnection(connection,'documenso');
 writeFileSync('/tmp/provider-ca.crt',connection.databaseCa,{flag:'wx',mode:0o400});
 const {config,expected,databaseEnv}=runtimeConfig({service:'documenso',url:connection.databaseUrl,projectRef:connection.projectRef,ca:connection.databaseCa,caPath:'/tmp/provider-ca.crt'});
 await verifyRuntime(new Client(config),expected,guard);Object.assign(process.env,databaseEnv);
 const {PrismaClient}=require('/app/node_modules/@prisma/client');prisma=new PrismaClient();
 const team=await prisma.team.findUniqueOrThrow({where:{url:'growthcast-portal-staging'}});assert.equal(team.id,3);
 await prisma.teamGlobalSettings.update({where:{id:team.teamGlobalSettingsId},data:{brandingEnabled:true,brandingLogo:'https://api.clients.staging.growthcast.app/growthcast-wordmark.png',brandingUrl:'https://growthcast.app',brandingCompanyDetails:'GrowthCast',brandingColors:{background:'#f4f1e9',foreground:'#242426',muted:'#eae5da',mutedForeground:'#6b655c',card:'#faf8f2',cardForeground:'#242426',border:'#d6d1c7',input:'#d6d1c7',primary:'#242426',primaryForeground:'#ffffff',secondary:'#eae5da',secondaryForeground:'#242426',accent:'#ff6b4a',accentForeground:'#242426',ring:'#ff6b4a',radius:'2px'},brandingCss:"font-family:Manrope,Arial,sans-serif; & h1,& h2,& h3{letter-spacing:-.04em} & nav img[src^='/api/branding/logo/']{width:188px;height:32px;object-fit:cover;max-width:42vw} & button,& input{font-family:inherit} & button[aria-haspopup=dialog]:has(svg.lucide-sparkles){display:none!important}"}});
 console.log('Dedicated staging team recipient branding updated');
}catch{console.error('Staging branding update refused; private details suppressed');process.exitCode=1;}finally{await prisma?.$disconnect();rmSync('/tmp/provider-ca.crt',{force:true});}
