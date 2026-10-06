import {describe,it,expect} from 'bun:test';
import {availablePaymentMethods} from './payment-methods';
const map={card_payments:'card',link_payments:'link',us_bank_account_ach_payments:'us_bank_account'};
describe('Stripe account payment-method lookup',()=>{
 it('uses the authenticated account endpoint for direct keys without me or expansion',async()=>{
  const calls:any[]=[];const config={stripe:{accounts:{retrieve:async(...args:any[])=>{calls.push(args);return {charges_enabled:true,capabilities:{card_payments:'active',link_payments:'pending',us_bank_account_ach_payments:'active'}};}}}};
  const result=await availablePaymentMethods(config as any,map);expect(calls).toEqual([[]]);expect(result.methods).toEqual([{id:'card',active:true},{id:'link',active:false},{id:'us_bank_account',active:true}]);
 });
 it('uses only the explicit connected account ID in Connect mode',async()=>{
  const calls:any[]=[];await availablePaymentMethods({stripeAccount:'acct_example',stripe:{accounts:{retrieve:async(...args:any[])=>{calls.push(args);return {charges_enabled:true,capabilities:{card_payments:'active'}};}}}} as any,map);expect(calls).toEqual([['acct_example']]);
 });
 it('keeps methods disabled if Stripe has disabled charges',async()=>{
  const r=await availablePaymentMethods({stripe:{accounts:{retrieve:async()=>({charges_enabled:false,capabilities:{card_payments:'active'}})}}} as any,map);expect(r.methods.every(m=>!m.active)).toBe(true);expect(r.chargesEnabled).toBe(false);
 });
 it('surfaces a bounded failure instead of pretending all capabilities are inactive',async()=>{
  try {await availablePaymentMethods({stripe:{accounts:{retrieve:async()=>{throw Error('private upstream diagnostic');}}}} as any,map);throw Error('Expected rejection');}catch(e:any){expect(e.getStatus()).toBe(503);expect(e.message).toContain('Unable to check');expect(e.message).not.toContain('private upstream');}
 });
});
