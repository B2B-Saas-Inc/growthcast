import {describe,it,expect} from 'bun:test';
import {render} from '@react-email/render';
import * as templates from '../../../packages/email/src/index';
const url='https://clients.staging.growthcast.app/verify-email?token=synthetic-token&next=portal';
const props={url,inviteUrl:url,portalUrl:url,dashboardUrl:url,name:'Example reader',clientName:'Example client',recipientName:'Example recipient',organizationName:'GrowthCast',inviterName:'Example inviter',projectName:'Example project',updateContent:'A safe <update> & review.',taskTitle:'Example task',invoiceNumber:'GC-123',amount:'$4,000.00',dueDate:'October 1, 2026',documentTitle:'Example document',documentType:'SIGNATURE',action:'signed',question:'Choose a direction',options:[{label:'Option A',voteCount:2,isWinner:true}]};
describe('GrowthCast transactional email branding',()=>{
 for(const [name,template] of Object.entries(templates))it(name+' renders branded content and retains its action URL',async()=>{
  const html=await render((template as any)(props));
  for(const expected of ['GrowthCast','Manrope','#f4f1e9','#242426','#ff6b4a','Arial','CLIENT PORTAL'])expect(html).toContain(expected);
  expect(html).not.toContain('#006b68');expect(html).not.toContain('Atrium');
  if(name!=='ConfigurationTestEmail')expect(html).toContain('token=synthetic-token&amp;next=portal');
  if(name==='ProjectUpdateEmail'){expect(html).toContain('&lt;update&gt;');expect(html).not.toContain('<update>');}
 });
});
