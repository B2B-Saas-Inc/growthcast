import 'reflect-metadata';
import { Controller, Post, Get, Req, Module, ForbiddenException, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from './dist/app.module';
import { MailService } from './dist/mail/mail.service';
import { STORAGE_PROVIDER } from './dist/files/storage/storage.interface';
import { StripeService } from './dist/billing/stripe.service';
import cookieParser from 'cookie-parser';
import { AuthService } from './dist/auth/auth.service';
import { AuthController } from './dist/auth/auth.controller';
import { AuthGuard } from './dist/common/guards/auth.guard';
import { PrismaService } from './dist/prisma/prisma.service';
import { createClaims, authorizeAccount } from './claims.mjs';
import { createCatalog } from './catalog.mjs';
import { createOwnership } from './ownership.mjs';
import { DocumentsController } from './dist/documents/documents.controller';
import { DocumentsService } from './dist/documents/documents.service';
import { DocumentAuditService } from './dist/documents/document-audit.service';
import { InvoicesController } from './dist/invoices/invoices.controller';
import { InvoicesService } from './dist/invoices/invoices.service';
import { InvoicePdfService } from './dist/invoices/invoice-pdf.service';
import { PaymentsController } from './dist/payments/payments.controller';
import { PaymentsService } from './dist/payments/payments.service';
import { FilesController } from './dist/files/files.controller';
import { FilesService } from './dist/files/files.service';
import { RolesGuard } from './dist/common/guards/roles.guard';
import {createStore} from '../../gateway/src/store.mjs';
import {guard as schemaGuard} from '../../gateway/foundation/migrate.mjs';

export function createApiRuntime({databaseUrl,browserMode,origin,onMail,sideEffects,authSecret}) {
if(!/^[a-f0-9]{64}$/.test(authSecret??''))throw Error('Mounted auth secret required');
const applicationDb=new PrismaService({datasources:{db:{url:databaseUrl}}});
const applicationStore=createStore(databaseUrl,{authorizeAccount});
const claims = createClaims(applicationStore.pool);
const catalog = createCatalog(applicationStore.pool);
const config = { get: (key, fallback) => ({ WEB_URL: origin, API_URL: origin, ALLOW_SIGNUPS: 'false', SECURE_COOKIES: browserMode?'true':'false' })[key] ?? fallback,
  getOrThrow: key => {if(key==='BETTER_AUTH_SECRET')return authSecret;throw Error('Unavailable configuration key');} };
let app;
const ownership = createOwnership(applicationStore.pool);
const audit = new DocumentAuditService(applicationDb, { warn() {}, error() {} });
const storage = Object.fromEntries(['upload','download','delete','getSignedUrl'].map(key => [key, async () => { sideEffects.storage++; throw Error('Unexpected synthetic storage access'); }]));
const notify = new Proxy({}, { get: () => async () => { sideEffects.notifications++; } });
const docs = ownership.documents(new DocumentsService(applicationDb,storage,{},notify,{},audit));
const invoices = ownership.invoices(new InvoicesService(applicationDb,notify));
const invoicePdf = ownership.invoicePdf(new InvoicePdfService(applicationDb));
const files = ownership.files(new FilesService(applicationDb,config,{},storage));
const stripe = { checkout: { sessions: { create: async () => {
  sideEffects.stripe++; return { id: 'cs_native_control', url: 'https://checkout.invalid/native' };
} } } };
const payments = ownership.payments(new PaymentsService(applicationDb,{stripe},{},config,notify));
const auth = new AuthService(config, applicationDb, { send: async (email, subject, html) => { await onMail(email,html); } }, { initializeFreePlan: async () => {} });

// Focused Nest module: actual Atrium auth controller, middleware and guards.
// Only the new bridge controller is supplied by this local compatibility spike.
class ClaimController {
  list(req) { return catalog.list({userId:req.user?.id,sessionId:req.session?.id}); }
  async open(req) {
    if(req.headers.origin!==origin)throw new ForbiddenException();
    const result=await catalog.open(req.params.id,{userId:req.user?.id,sessionId:req.session?.id});
    if(!result)throw new ForbiddenException('Document unavailable');
    return result;
  }
  async claim(req) {
    if (req.headers.origin !== origin || !req.body || Object.keys(req.body).join() !== 'claim') throw new ForbiddenException();
    const result = await claims.claim(req.body.claim, { userId: req.user?.id, sessionId: req.session?.id });
    if (!result) throw new ForbiddenException('Claim unavailable');
    return result;
  }
}
Controller('portal')(ClaimController);
UseGuards(AuthGuard)(ClaimController);
Post('claim')(ClaimController.prototype, 'claim', Object.getOwnPropertyDescriptor(ClaimController.prototype, 'claim'));
Req()(ClaimController.prototype, 'claim', 0);
Get('catalog')(ClaimController.prototype,'list',Object.getOwnPropertyDescriptor(ClaimController.prototype,'list'));
Req()(ClaimController.prototype,'list',0);
Post('catalog/:id/open')(ClaimController.prototype,'open',Object.getOwnPropertyDescriptor(ClaimController.prototype,'open'));
Req()(ClaimController.prototype,'open',0);
Reflect.defineMetadata('design:paramtypes', [AuthService, ConfigService], AuthController);
for (const [controller, dependencies] of [
  [DocumentsController,[DocumentsService,FilesService,DocumentAuditService]],
  [InvoicesController,[InvoicesService,InvoicePdfService,FilesService]],
  [PaymentsController,[PaymentsService]], [FilesController,[FilesService]],
  [AuthGuard,[Reflector]], [RolesGuard,[Reflector]],
]) Reflect.defineMetadata('design:paramtypes',dependencies,controller);
class HttpFixture {}
const overrides = [
  { provide: AuthService, useValue: auth }, { provide: ConfigService, useValue: config },
  { provide: DocumentsService, useValue: docs }, { provide: FilesService, useValue: files },
  { provide: DocumentAuditService, useValue: audit }, { provide: InvoicesService, useValue: invoices },
  { provide: InvoicePdfService, useValue: invoicePdf }, { provide: PaymentsService, useValue: payments },
  { provide: AuthGuard, useValue: new AuthGuard(new Reflector()) }, { provide: RolesGuard, useValue: new RolesGuard(new Reflector()) },
];
Module({ imports: [AppModule], controllers: [ClaimController] })(HttpFixture);

return {db:applicationDb,store:applicationStore,claims,docs,payments,invoicePdf,
 async start(){
  await schemaGuard(applicationStore.pool);
  let builder = Test.createTestingModule({ imports: [HttpFixture] });
  for (const {provide,useValue} of overrides) builder = builder.overrideProvider(provide).useValue(useValue);
  builder = builder.overrideProvider(PrismaService).useValue(applicationDb)
    .overrideProvider(MailService).useValue({ send: async () => ({sent:true,viaOrgConfig:false}) })
    .overrideProvider(STORAGE_PROVIDER).useValue(storage)
    .overrideProvider(StripeService).useValue({ stripe, mode:'test', resolveKey:()=>'' });
  const module = await builder.compile();
  app = module.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.use((_req, res, next) => { res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex, nofollow'); res.setHeader('Referrer-Policy','no-referrer'); next(); });
  app.useGlobalGuards(ownership.guard);
  app.setGlobalPrefix('api');
  await app.listen(3001, '0.0.0.0');
 },
 async close(){await app?.close();await applicationDb.$disconnect();await applicationStore.pool.end();}
};
}
