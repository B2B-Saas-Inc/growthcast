// Operator-only commissioning. Receives private configuration through stdin.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,rmSync} from 'node:fs';
import {runtimeConfig,verifyRuntime} from '/boundary/deployment/runtime/config.mjs';
import {validateConnection} from '/boundary/deployment/runtime-connections/deliver.mjs';
import {guard} from '/boundary/deployment/supabase/managed-documenso/migrate.mjs';
const require=createRequire('/boundary/package.json'),{Client}=require('pg');
let prisma;
try{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>20000)throw Error();}
 const {connection,credential}=JSON.parse(input);input='';
 assert.equal(process.getuid(),1001);validateConnection(connection,'documenso');
 assert.equal(credential.purpose,'staging-portal-signing-api');assert.match(credential.token,/^api_[a-f0-9]{48}$/);
 writeFileSync('/tmp/provider-ca.crt',connection.databaseCa,{flag:'wx',mode:0o400});
 const {config,expected,databaseEnv}=runtimeConfig({service:'documenso',url:connection.databaseUrl,projectRef:connection.projectRef,ca:connection.databaseCa,caPath:'/tmp/provider-ca.crt'});
 await verifyRuntime(new Client(config),expected,guard);
 Object.assign(process.env,databaseEnv);
 const {PrismaClient}=require('/app/node_modules/@prisma/client');prisma=new PrismaClient();
 const email='portal-signing-staging@growthcast.invalid',name='GrowthCast portal staging',slug='growthcast-portal-staging';
 const tokenHash=createHash('sha512').update(credential.token).digest('hex');
 const result=await prisma.$transaction(async db=>{
  await db.$executeRaw`SELECT pg_advisory_xact_lock(785342,13)`;
  let user=await db.user.findUnique({where:{email}});
  if(user){
   const org=await db.organisation.findUniqueOrThrow({where:{url:slug}});
   const team=await db.team.findUniqueOrThrow({where:{url:slug}});
   const token=await db.apiToken.findFirstOrThrow({where:{token:tokenHash,userId:user.id,teamId:team.id,name:'growthcast-portal-staging'}});
   assert.equal(org.ownerUserId,user.id);assert.equal(team.organisationId,org.id);assert.equal(user.name,name);
   assert.equal(await db.apiToken.count({where:{userId:user.id}}),1);
   return {userId:user.id,organizationId:org.id,teamId:team.id,tokenId:token.id,reused:true};
  }
  const claim=await db.subscriptionClaim.findUniqueOrThrow({where:{id:'free'}}),claimData={...claim};
  for(const key of ['id','name','createdAt','updatedAt','locked'])delete claimData[key];
  const id=()=>randomUUID();
  user=await db.user.create({data:{name,email,emailVerified:new Date()}});
  const settings=await db.organisationGlobalSettings.create({data:{id:id(),emailDocumentSettings:{}}});
  const ownClaim=await db.organisationClaim.create({data:{id:id(),originalSubscriptionClaimId:claim.id,...claimData}});
  const auth=await db.organisationAuthenticationPortal.create({data:{id:id(),enabled:false,clientId:'',clientSecret:'',wellKnownUrl:''}});
  const org=await db.organisation.create({data:{id:id(),name,type:'PERSONAL',url:slug,ownerUserId:user.id,organisationClaimId:ownClaim.id,organisationGlobalSettingsId:settings.id,organisationAuthenticationPortalId:auth.id}});
  const group=await db.organisationGroup.create({data:{id:id(),type:'INTERNAL_ORGANISATION',organisationRole:'ADMIN',organisationId:org.id}});
  const member=await db.organisationMember.create({data:{id:id(),userId:user.id,organisationId:org.id}});
  await db.organisationGroupMember.create({data:{id:id(),groupId:group.id,organisationMemberId:member.id}});
  const teamSettings=await db.teamGlobalSettings.create({data:{id:id()}});
  const team=await db.team.create({data:{name,url:slug,organisationId:org.id,teamGlobalSettingsId:teamSettings.id}});
  await db.teamGroup.create({data:{id:id(),organisationGroupId:group.id,teamId:team.id,teamRole:'ADMIN'}});
  const token=await db.apiToken.create({data:{name:'growthcast-portal-staging',token:tokenHash,userId:user.id,teamId:team.id}});
  return {userId:user.id,organizationId:org.id,teamId:team.id,tokenId:token.id,reused:false};
 },{timeout:30000});
 console.log(JSON.stringify(result));
}catch{console.error('Provider commissioning refused; private diagnostics suppressed');process.exitCode=1;}
finally{await prisma?.$disconnect();rmSync('/tmp/provider-ca.crt',{force:true});}
