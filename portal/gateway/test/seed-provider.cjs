/* eslint-disable @typescript-eslint/no-require-imports -- Uses the Prisma client bundled in the pinned upstream image. */
// Explicit local bootstrap only. Business documents are subsequently created
// through the provider API. No license flags are manufactured or elevated.
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { randomBytes, createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const url = new URL(process.env.NEXT_PRIVATE_DATABASE_URL);
require('./disposable-provider.cjs')(url);
const prisma = new PrismaClient();
(async () => {
  const claim = await prisma.subscriptionClaim.findUniqueOrThrow({ where: { id: 'free' } });
  const claimId=claim.id;
  const claimData={...claim};
  for(const key of ['id','name','createdAt','updatedAt','locked']) delete claimData[key];
  const providers=[];
  for(let index=0;index<2;index++) {
  const id = () => randomUUID();
  const user = await prisma.user.create({ data: { name: 'Synthetic GrowthCast Operator', email: `${id()}@growthcast.invalid`, emailVerified: new Date() } });
  const settings = await prisma.organisationGlobalSettings.create({ data: { id: id(), emailDocumentSettings: {} } });
  const ownClaim = await prisma.organisationClaim.create({ data: { id: id(), originalSubscriptionClaimId: claimId, ...claimData } });
  const portal = await prisma.organisationAuthenticationPortal.create({ data: { id: id(), enabled: false, clientId: '', clientSecret: '', wellKnownUrl: '' } });
  const org = await prisma.organisation.create({ data: { id: id(), name: 'GrowthCast synthetic local test', type: 'PERSONAL', url: id(), ownerUserId: user.id,
    organisationClaimId: ownClaim.id, organisationGlobalSettingsId: settings.id, organisationAuthenticationPortalId: portal.id } });
  const group = await prisma.organisationGroup.create({ data: { id: id(), type: 'INTERNAL_ORGANISATION', organisationRole: 'ADMIN', organisationId: org.id } });
  const member = await prisma.organisationMember.create({ data: { id: id(), userId: user.id, organisationId: org.id } });
  await prisma.organisationGroupMember.create({ data: { id: id(), groupId: group.id, organisationMemberId: member.id } });
  const teamSettings = await prisma.teamGlobalSettings.create({ data: { id: id() } });
  const team = await prisma.team.create({ data: { name: 'Synthetic team', url: id(), organisationId: org.id, teamGlobalSettingsId: teamSettings.id } });
  await prisma.teamGroup.create({ data: { id: id(), organisationGroupId: group.id, teamId: team.id, teamRole: 'ADMIN' } });
  const token = 'api_' + randomBytes(24).toString('hex');
  await prisma.apiToken.create({ data: { name: 'local-spike', token: createHash('sha512').update(token).digest('hex'), userId: user.id, teamId: team.id } });
  providers.push({ token, teamId: team.id, organizationId: org.id });
  }
  fs.writeFileSync('/runtime/provider.json', JSON.stringify(providers));
  console.log('Two synthetic organization/operator/team/API bindings created using existing free claims.');
})().finally(() => prisma.$disconnect());
