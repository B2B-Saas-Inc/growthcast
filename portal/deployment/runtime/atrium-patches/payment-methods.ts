import {ServiceUnavailableException} from '@nestjs/common';
import type Stripe from 'stripe';
export async function availablePaymentMethods(config:{stripe:Stripe;stripeAccount?:string},capabilityMap:Record<string,string>) {
 try {
  // Direct keys use GET /v1/account. Connected accounts require their explicit ID.
  // Capabilities are already included; they are not an expandable resource.
  const account=config.stripeAccount
   ? await config.stripe.accounts.retrieve(config.stripeAccount)
   : await config.stripe.accounts.retrieve();
  const capabilities=account.capabilities as Record<string,string>|undefined;
  return {chargesEnabled:account.charges_enabled,methods:Object.entries(capabilityMap).map(([cap,id])=>({id,active:account.charges_enabled===true && capabilities?.[cap]==='active'}))};
 } catch {
  throw new ServiceUnavailableException('Unable to check payment methods with Stripe. Retry the check, or verify the saved key’s account permissions in Stripe.');
 }
}
