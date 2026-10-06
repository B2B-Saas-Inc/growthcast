import {completionMail} from './completion-mail.mjs';
import {storeWithPool} from '../../gateway/src/store.mjs';
import {managedProviderApi} from './provider-api.mjs';
import {signingProvider} from './provider.mjs';
import {documentDelivery} from './delivery.mjs';
import {deliveryGateway,documentGrantTtl} from './gateway.mjs';
import {deliverySecrets} from './secrets.mjs';
import {workspaceDocumentMailer} from './workspace-mail.mjs';
import {countPdfPages} from './pdf.mjs';
// Runtime-only factory. Schema/role guards and private credential delivery must
// succeed before constructing this factory or enabling staff send routes.
export function managedDeliveryFactory({organizationId,providerToken,teamId,encryptionKey,authSecret}){
 if(typeof organizationId!=='string'||!organizationId||organizationId.length>200)throw Error('Explicit signing workspace required');
 const api=managedProviderApi({origin:'http://documenso.signing.staging.growthcast.internal:3000',token:providerToken});
 const provider=signingProvider({api,teamId}),secrets=deliverySecrets(encryptionKey);
 const scope=org=>{if(org!==organizationId)throw Error('Signing workspace unavailable');};
 return ({pool,flow,readArtifact,readCompletedArtifact})=>{
  const scopedFlow={...flow,signingSource(actor,org,...args){scope(org);return flow.signingSource(actor,org,...args);},prepareDispatch(actor,org,...args){scope(org);return flow.prepareDispatch(actor,org,...args);}};
  const gateway=deliveryGateway({store:storeWithPool(pool,'staging',{maxGrantTtl:documentGrantTtl}),pool,environment:'staging'});
  const mailer=workspaceDocumentMailer({pool,organizationId,authSecret});
  const delivery=documentDelivery({pool,flow:scopedFlow,provider,readArtifact,countPages:countPdfPages,gateway,mailer,secrets,signingOrigin:'https://api.clients.staging.growthcast.app'});
  const confirmations=completionMail({pool,organizationId,readArtifact:readCompletedArtifact,mailer});
  return {...delivery,
   async runOnce(){const result=await delivery.runOnce();await confirmations.runOnce();return result;},
   async request(actor,org,...args){scope(org);return delivery.request(actor,org,...args);},
   async status(actor,org,...args){scope(org);return delivery.status(actor,org,...args);},
   async statusForApproval(actor,org,...args){scope(org);return delivery.statusForApproval(actor,org,...args);}
  };
 };
}
