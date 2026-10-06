import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path = '/upstream/apps/api/src/mail/mail.service.ts';
let source = readFileSync(path,'utf8');
if (createHash('sha256').update(source).digest('hex') !== '68fa757211611768ac4bc712cee928f9da418e64e153a0f031f0b3b2e4129e2b') {
  throw Error('Pinned upstream MailService changed; patch review required');
}
source = 'import {sendWorkspaceMail,SMTP_TIMEOUTS} from "../workspace-mail";\nimport { createCapturedMail } from "./capture-mail";\n' + source;
const replace = (before,after) => {
  if (source.split(before).length !== 2) throw Error('Unique reviewed patch context required');
  source = source.replace(before,after);
};
replace('  private resend: Resend | null;', '  private capturedMail: ReturnType<typeof createCapturedMail>;\n  private resend: Resend | null;');
replace('    // Initialize default Resend client', '    this.capturedMail = createCapturedMail(config);\n    // Initialize default Resend client');
replace('    if (organizationId) {', '    if (this.capturedMail) { const captured = await this.capturedMail(to, subject, html); if (captured) return captured; }\n    if (this.config.get("PORTAL_MAIL_MODE") === "workspace-smtp") return sendWorkspaceMail(this.settingsService,this.config,to,subject,html);\n    if (organizationId) {');
replace('      host: smtp.host ?? undefined,','      ...SMTP_TIMEOUTS,\n      host: smtp.host ?? undefined,');
writeFileSync(path,source);
copyFileSync('/patches/capture-mail.ts','/upstream/apps/api/src/mail/capture-mail.ts');

function patchFile(path, hash, transform) {
  const source = readFileSync(path,'utf8');
  if (createHash('sha256').update(source).digest('hex') !== hash) throw Error('Pinned upstream source changed; patch review required');
  writeFileSync(path,transform(source));
}
patchFile('/upstream/apps/api/src/main.ts','7fb9cd2b15d49df122abd0396e904f5044d37a6d9da1cfb82a01e5e231688cab', source =>
  'import { privateIngress } from "./private-ingress";\n' + source.replace('  app.useLogger(app.get(Logger));', '  app.use(privateIngress());\n  app.useLogger(app.get(Logger));'));
copyFileSync('/patches/private-ingress.ts','/upstream/apps/api/src/private-ingress.ts');
const origin = readFileSync('/patches/api-origin.mjs','utf8');
if (!origin.includes('originAuthorized(headers,secret)')) throw Error('Origin helper type adaptation needs review');
writeFileSync('/upstream/apps/api/src/portal-origin.ts',origin.replace('originAuthorized(headers,secret)', 'originAuthorized(headers: {get(name: string): string | null},secret: string)'));
patchFile('/upstream/apps/api/src/files/storage/local.storage.ts','80b173ac728ef9f3505c5ddee3958e5f7bb190499328a961ebe438cddc2e8b40', source =>
  source.replace('    if (!filePath.startsWith(path.resolve(this.uploadDir))) {',
    '    const relative = path.relative(path.resolve(this.uploadDir), filePath);\n    if (!relative || path.isAbsolute(key) || key.includes("\\\\") || key.includes("\\0") || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {'));
patchFile('/upstream/apps/api/src/files/files.module.ts','6528cc8340367758a58b95b630be33b79acc9025d644380070d65100cb2e01d5', source =>
  'import { SupabaseStorage } from "./storage/supabase.storage";\n' + source.replace('          case "s3":', '          case "supabase":\n            return new SupabaseStorage(config);\n          case "s3":'));
copyFileSync('/patches/supabase.storage.ts','/upstream/apps/api/src/files/storage/supabase.storage.ts');

patchFile('/upstream/apps/api/src/auth/auth.service.ts','1e6180b304cd6c948cb3afa13be4bd07e461356be92c040ae1987b5744aa43cb', source =>
  source.replace('        enabled: true,','        enabled: true,\n        requireEmailVerification: true,').replace('        organization({','        organization({\n          requireEmailVerificationOnInvitation: true,'));

patchFile('/upstream/apps/api/src/common/guards/auth.guard.ts','79390dd9d9d48f0eee80224d08ca6bdef531ca424e9d99b101215ac7bf0f04e3', source =>
  source.replace('  UnauthorizedException,','  UnauthorizedException,\n  ForbiddenException,').replace('    if (!request.organization) {','    if (request.user.emailVerified !== true) {\n      throw new ForbiddenException("Verify your email before accessing the portal");\n    }\n\n    if (!request.organization) {'));
copyFileSync('/patches/verified-access.spec.ts','/upstream/apps/api/src/common/guards/verified-access.spec.ts');

copyFileSync('/patches/workspace-mail.ts','/upstream/apps/api/src/workspace-mail.ts');
patchFile('/upstream/apps/api/src/settings/settings.service.ts','7a8965736f8800371af78581b1ae072d111dab5ef427625f615662d6896a63af', source => 'import {SMTP_TIMEOUTS} from "../workspace-mail";\n'+source.replace('          host: emailConfig.smtp!.host ?? undefined,','          ...SMTP_TIMEOUTS,\n          host: emailConfig.smtp!.host ?? undefined,').replaceAll('Atrium - Test Email','GrowthCast - Test Email').replaceAll('test email from Atrium','test email from GrowthCast'));

copyFileSync('/patches/workspace-mail.spec.ts','/upstream/apps/api/src/workspace-mail.spec.ts');

copyFileSync('/patches/resource-planning.ts','/upstream/apps/api/src/resource-planning.ts');
copyFileSync('/patches/resource-planning.spec.ts','/upstream/apps/api/src/resource-planning.spec.ts');
const appModule='/upstream/apps/api/src/app.module.ts';
const appSource=readFileSync(appModule,'utf8');
if(appSource.split('    ProjectsModule,').length!==2) throw Error('Planning module patch context changed');
writeFileSync(appModule,'import {ResourcePlanningModule} from "./resource-planning";\n'+appSource.replace('    ProjectsModule,','    ProjectsModule,\n    ResourcePlanningModule,'));

await import('/patches/email-brand.mjs');

copyFileSync('/patches/payment-methods.ts','/upstream/apps/api/src/payment-methods.ts');
copyFileSync('/patches/payment-methods.spec.ts','/upstream/apps/api/src/payment-methods.spec.ts');
const paymentPath='/upstream/apps/api/src/payments/payments.service.ts';
let paymentSource=readFileSync(paymentPath,'utf8');
const paymentStart=paymentSource.indexOf('  async getAvailablePaymentMethods(orgId: string) {');
const paymentEnd=paymentSource.indexOf('  async savePaymentMethods(',paymentStart);
if(paymentStart<0||paymentEnd<0||!paymentSource.slice(paymentStart,paymentEnd).includes('const accountId = config.stripeAccount ?? "me";'))throw Error('Payment method patch context changed');
paymentSource='import {availablePaymentMethods} from "../payment-methods";\n'+paymentSource.slice(0,paymentStart)+'  async getAvailablePaymentMethods(orgId: string) {\n    return availablePaymentMethods(await this.getStripeConfig(orgId), this.CAPABILITY_MAP);\n  }\n\n'+paymentSource.slice(paymentEnd);
writeFileSync(paymentPath,paymentSource);

for (const name of ["revenue-report.ts","revenue-report.spec.ts"]) copyFileSync("/patches/"+name,"/upstream/apps/api/src/"+name);
// New hourly entries snapshot the Budget tab billing rate; existing entries retain theirs.
const timeService='/upstream/apps/api/src/time-entries/time-entries.service.ts';
let timeSource=readFileSync(timeService,'utf8');
const rateMarker='  private async resolveRate(orgId: string, userId: string, projectId: string): Promise<number | null> {';
if (!timeSource.includes(rateMarker)) throw Error('Pinned rate resolver changed');
timeSource=timeSource.replace(rateMarker,rateMarker+`
    const budgets=await this.prisma.$queryRaw<{targetRateCents:number}[]>\`SELECT b."targetRateCents" FROM gc_atrium.project_budget b JOIN gc_atrium.project p ON p.id=b."projectId" WHERE p.id=\${projectId} AND p."organizationId"=\${orgId} AND b."engagementType"='hourly'\`;
    if(budgets[0]) return budgets[0].targetRateCents;
`);
writeFileSync(timeService,timeSource);

// Bun resolves Stripe's Web Crypto provider, which requires asynchronous verification.
patchFile('/upstream/apps/api/src/payments/connect-webhook.controller.ts','fae38a8b2f05e8969862e2fa8b15c10c477dc081d5c1565151bd78c9a4b26b70', source => {
  const old='this.stripeService.stripe.webhooks.constructEvent(rawBody, sig, secret)';
  if(source.split(old).length!==3)throw Error('Both reviewed Stripe webhook verification sites required');
  return source.replaceAll(old,'await this.stripeService.stripe.webhooks.constructEventAsync(rawBody, sig, secret)');
});

// Uploaded records have no client workflow unless an action was requested.
for(const name of ['upload-mode.ts','file-library.ts','file-library.spec.ts'])copyFileSync('/patches/'+name,'/upstream/apps/api/src/'+name);
const docsPath='/upstream/apps/api/src/documents/documents.service.ts';
let docs=readFileSync(docsPath,'utf8');
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('File library patch context changed: '+a);return s.replace(a,b);};
docs='import {needsDocumentAction} from "../upload-mode";\n'+docs;
docs=once(docs,'        status: "draft",','        status: needsDocumentAction(dto) ? "draft" : "uploaded",');
docs=once(docs,'        reminderEnabled: dto.reminderEnabled ?? false,','        reminderEnabled: needsDocumentAction(dto) && (dto.reminderEnabled ?? false),');
docs=once(docs,'    // Prevent sending signature docs with no fields placed','    if (!needsDocumentAction(doc)) throw new BadRequestException("This file needs no client action; upload it without sending");\n\n    // Prevent sending signature docs with no fields placed');
docs=docs.replace('new Set(["draft", "voided", "expired", "accepted"','new Set(["uploaded", "draft", "voided", "expired", "accepted"').replace('new Set(["draft", "voided", "expired", "signed"','new Set(["uploaded", "draft", "voided", "expired", "signed"');
if(docs.split('const wasSent = doc.status !== "draft";').length!==3)throw Error("Document version patch context changed");
docs=docs.replaceAll('const wasSent = doc.status !== "draft";','const wasSent = doc.status !== "draft" && doc.status !== "uploaded";');
writeFileSync(docsPath,docs);
let moduleSource=readFileSync(appModule,'utf8');
moduleSource='import {FileLibraryModule} from "./file-library";\n'+once(moduleSource,'    ProjectsModule,','    ProjectsModule,\n    FileLibraryModule,');writeFileSync(appModule,moduleSource);
// All ordinary file downloads are attachments, including Library HTML copies.
const filesController='/upstream/apps/api/src/files/files.controller.ts';
let fc=readFileSync(filesController,'utf8');fc=once(fc,'    body.pipe(res);','    res.setHeader("X-Content-Type-Options", "nosniff");\n    res.setHeader("Content-Security-Policy", "sandbox; default-src \'none\'");\n    res.setHeader("Cache-Control", "private, no-store");\n    body.pipe(res);');writeFileSync(filesController,fc);
