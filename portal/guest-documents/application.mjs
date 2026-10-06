import {StorageClient} from '../deployment/storage/client.mjs';
import {staffAuthenticator} from './adapters.mjs';
import {documentIngestion,registeredArtifacts} from './ingestion.mjs';
import {workflow} from './workflow.mjs';
import {access} from './access.mjs';
import {guestHandler} from './http.mjs';
// Composition only: the reviewed runtime/ingress must supply these private configurations.
// No synthetic authentication, storage or artifact-verification fallback exists.
export function createGuestApplication({pool,apiOrigin,portalOrigin,originProof,storageConfiguration,logo}){
 return createGuestServices({pool,apiOrigin,portalOrigin,originProof,storageConfiguration,logo}).handler;
}
export function createGuestServices({pool,apiOrigin,portalOrigin,originProof,storageConfiguration,logo,createDelivery}){
 if(createDelivery!==undefined&&typeof createDelivery!=='function')throw Error('Explicit delivery composition required');
 const storage=new StorageClient(storageConfiguration),artifacts=registeredArtifacts({pool,storage}),ingestion=documentIngestion({pool,storage});
 const flow=workflow(pool,{verifyArtifact:artifacts.verify});
 const delivery=createDelivery?.({pool,flow,readArtifact:artifacts.read,readCompletedArtifact:key=>storage.download(key)});
 if(createDelivery&&(!delivery?.request||!delivery?.statusForApproval||!delivery?.runOnce))throw Error('Configured delivery service required');
 const handler=guestHandler({origin:portalOrigin,logo,ingestion,delivery,store:access(pool),staffWorkflow:flow,
  authenticateStaff:staffAuthenticator({pool,apiOrigin,portalOrigin,originProof}),readArtifact:artifacts.read,readCompletedArtifact:key=>storage.download(key)});
 return {handler,delivery};
}
