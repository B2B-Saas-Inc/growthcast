import {writeFileSync} from 'node:fs';
import {render} from '/upstream/apps/api/node_modules/@react-email/render/dist/node/index.mjs';
import {InvitationEmail,ResetPasswordEmail,ProjectUpdateEmail,ConfigurationTestEmail} from '/upstream/packages/email/dist/index.js';
const samples={invitation:InvitationEmail({inviteUrl:'https://clients.staging.growthcast.app/accept-invite?id=synthetic-preview',organizationName:'GrowthCast',inviterName:'The GrowthCast team'}),reset:ResetPasswordEmail({url:'https://clients.staging.growthcast.app/reset-password?token=synthetic-preview'}),update:ProjectUpdateEmail({clientName:'Example client',projectName:'Your growth roadmap',updateContent:'Your monthly growth review is ready. We have added the results and next steps to your project.',portalUrl:'https://clients.staging.growthcast.app/portal/projects'}),test:ConfigurationTestEmail()};
for(const [name,element] of Object.entries(samples))writeFileSync('/work/email-'+name+'.html',await render(element));
console.log('Four credential-free email previews rendered from the production image.');
