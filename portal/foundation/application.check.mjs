import 'reflect-metadata';
import {readFileSync} from 'node:fs';
import {createStore} from '../../gateway/src/store.mjs';
import {createClaims,authorizeAccount} from './claims.mjs';
import {createCatalog} from './catalog.mjs';
import assert from 'node:assert/strict';
import {Controller,Get,Post,Req,Module,UseGuards,ForbiddenException} from '@nestjs/common';
import {AuthGuard} from './dist/common/guards/auth.guard';
import {Test} from '@nestjs/testing';
import {ConfigService} from '@nestjs/config';
import cookieParser from 'cookie-parser';
import {AppModule} from './dist/app.module';
import {PrismaService} from './dist/prisma/prisma.service';
import {MailService} from './dist/mail/mail.service';
import {StripeService} from './dist/billing/stripe.service';
import {STORAGE_PROVIDER} from './dist/files/storage/storage.interface';
const deadline=setTimeout(()=>{console.error('Application check exceeded 45 seconds');process.exit(1);},45000);deadline.unref();
const origin='http://localhost:3001';
const config={get:(key,fallback)=>({WEB_URL:origin,API_URL:origin,ALLOW_SIGNUPS:'false',SECURE_COOKIES:'false'})[key]??fallback,getOrThrow:()=> 'synthetic-foundation-auth-secret-32-characters'};
const connection=new URL(process.env.DATABASE_URL);connection.search='';
const store=createStore(connection.href,{authorizeAccount,ssl:{ca:readFileSync('/ca/server.crt','utf8'),rejectUnauthorized:true}});
const claims=createClaims(store.pool),catalog=createCatalog(store.pool);
class PortalController {
 list(req){return catalog.list({userId:req.user?.id,sessionId:req.session?.id});}
 async open(req){
  if(req.headers.origin!==origin)throw new ForbiddenException();
  const result=await catalog.open(req.params.id,{userId:req.user?.id,sessionId:req.session?.id});
  if(!result)throw new ForbiddenException();return result;
 }
}
Controller('portal')(PortalController);UseGuards(AuthGuard)(PortalController);
Get('documents')(PortalController.prototype,'list',Object.getOwnPropertyDescriptor(PortalController.prototype,'list'));
Req()(PortalController.prototype,'list',0);
Post('documents/:id/open')(PortalController.prototype,'open',Object.getOwnPropertyDescriptor(PortalController.prototype,'open'));
Req()(PortalController.prototype,'open',0);
class ApplicationFixture {}
Module({imports:[AppModule],controllers:[PortalController]})(ApplicationFixture);
const captured=[];
const module=await Test.createTestingModule({imports:[ApplicationFixture]})
  .overrideProvider(ConfigService).useValue(config)
  .overrideProvider(MailService).useValue({send:async (...message)=>{captured.push(message);return {sent:true,viaOrgConfig:false};}})
  .overrideProvider(StripeService).useValue({stripe:{},mode:'test',resolveKey:()=>''})
  .overrideProvider(STORAGE_PROVIDER).useValue(Object.fromEntries(['upload','download','delete','getSignedUrl'].map(key=>[key,async()=>{throw Error('Unexpected storage side effect');}])))
  .compile();
const app=module.createNestApplication({logger:false});
app.use(cookieParser());app.setGlobalPrefix('api');
const db=module.get(PrismaService);
const cookies=new Map();
async function request(path,body) {
 const response=await fetch(origin+path,{method:body?'POST':'GET',redirect:'manual',headers:{Origin:origin,Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json','x-csrf-token':cookies.get('csrf-token')||''},body:body?JSON.stringify(body):undefined});
 for(const raw of response.headers.getSetCookie()){const pair=raw.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 return response;
}
try {
 await app.listen(3001,'0.0.0.0');
 assert.equal((await db.$queryRawUnsafe('SELECT current_user')).at(0).current_user,'gc_app');
 assert.equal((await db.$queryRawUnsafe('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).at(0).ssl,true);
 await assert.rejects(()=>db.$executeRawUnsafe('CREATE TABLE public.application_escape(id integer)'));
 await assert.rejects(()=>db.$executeRawUnsafe('DELETE FROM sealed_artifacts'));
 await db.invitation.create({data:{id:'foundation-invite',organizationId:'restore-org',inviterId:'restore-user',email:'invited@example.test',role:'member',status:'pending',expiresAt:new Date(Date.now()+3600000)}});
 assert.equal((await request('/api/auth/sign-up/email',{name:'Blocked',email:'uninvited@example.test',password:'synthetic-password-1234'})).status,403);
 const signup=await request('/api/auth/sign-up/email',{name:'Invited',email:'invited@example.test',password:'synthetic-password-1234'});
 assert.equal(signup.status,200);
 const {user}=await signup.json();
 assert.equal(user.emailVerified,false);
 assert(captured.length>0,'Verification email must be captured');
 const link=captured.flatMap(x=>x.filter(v=>typeof v==='string')).join('\n').match(/https?:[^"\s<>]*verify-email[^"\s<>]*/)?.[0]?.replaceAll('&amp;','&');
 assert(link,'Captured verification link required');
 const parsed=new URL(link);
 assert([200,302].includes((await request(parsed.pathname+parsed.search)).status));
 assert.equal((await db.user.findUnique({where:{id:user.id}})).emailVerified,true);
 const session=await request('/api/auth/get-session');assert.equal(session.status,200);
 const authenticated=await session.json();assert.equal(authenticated.user.id,user.id);
 const identity={userId:user.id,sessionId:authenticated.session.id};
 await db.member.create({data:{id:'foundation-member',organizationId:'restore-org',userId:user.id,role:'member'}});
 await db.projectClient.create({data:{projectId:'restore-project',userId:user.id}});
 assert.equal((await request('/api/auth/organization/set-active',{organizationId:'restore-org'})).status,200);
 assert.equal((await request('/api/auth/get-session')).status,200);
 const source='11111111-1111-4111-8111-111111111111';
 const token=await claims.provision(source,'restore-document');
 assert.equal(await claims.claim(token,{...identity,userId:'restore-user'}),null);
 const handoff=await claims.claim(token,identity);assert(handoff);
 assert.equal(await claims.claim(token,identity),null);
 assert.equal((await catalog.list(identity)).length,1);
 const listed=await request('/api/portal/documents');assert.equal(listed.status,200);assert.equal((await listed.json()).length,1);
 assert.equal((await fetch(origin+'/api/portal/documents')).status,401);
 assert.deepEqual(await catalog.list({...identity,userId:'restore-user'}),[]);
 const openResponse=await request('/api/portal/documents/restore-document/open',{});assert.equal(openResponse.status,201);
 const opened=await openResponse.json();assert(opened.handoff);
 const redeemed=await store.redeem(opened.handoff);assert(redeemed);
 assert.equal(await store.redeem(opened.handoff),null);
 assert.equal((await store.authorize(redeemed.token)).binding.items[0].dataId,'sealed-data');
 await assert.rejects(()=>store.pool.query('SELECT copy_account_artifacts($1)',[source]),/scope denied/);
 const derived=(await store.pool.query('SELECT grant_id,context FROM account_grants LIMIT 1')).rows[0];
 await store.pool.query('UPDATE account_grants SET context=$2 WHERE grant_id=$1',[derived.grant_id,{...derived.context,sessionId:'invalid-session'}]);
 await assert.rejects(()=>store.pool.query('SELECT copy_account_artifacts($1)',[derived.grant_id]),/scope denied/);
 await store.pool.query('UPDATE account_grants SET context=$2 WHERE grant_id=$1',[derived.grant_id,derived.context]);
 assert.equal((await store.pool.query("SELECT has_function_privilege('gc_lifecycle','copy_account_artifacts(uuid)','EXECUTE') AS allowed")).rows[0].allowed,false);
 await assert.rejects(()=>store.pool.query("INSERT INTO sealed_artifacts VALUES($1,'forged','forged',$2)",[source,'a'.repeat(64)]));
 await db.projectClient.delete({where:{projectId_userId:{projectId:'restore-project',userId:user.id}}});
 assert.equal(await store.authorize(redeemed.token),null);
 assert.equal(await catalog.open('restore-document',identity),null);
 assert.equal((await request('/api/portal/documents/restore-document/open',{})).status,403);
 await db.projectClient.create({data:{projectId:'restore-project',userId:user.id}});
 assert(await store.authorize(redeemed.token));
 await store.revoke(source);
 assert.equal(await store.authorize(redeemed.token),null);
 assert.deepEqual(await catalog.list(identity),[]);
 console.log('Restricted catalog/claim/gateway store passed canonical artifact copy, replay, wrong identity, membership removal and source revocation checks.');
 console.log('Full AppModule passed with non-owner Prisma over TLS: invited signup, captured verification mail, verified session, closed signup and database privilege denials.');
} finally {await store.pool.end();await app.close();clearTimeout(deadline);}
