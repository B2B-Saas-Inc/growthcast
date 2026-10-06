import assert from 'node:assert/strict';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
import {managedProviderApi} from '/app/guest-documents/signing/provider-api.mjs';
const client=new SecretsManagerClient({region:'us-east-1',credentials:fromContainerMetadata(),maxAttempts:2});
const origin='http://documenso.signing.staging.growthcast.internal:3000';
try{
 const pin=JSON.parse(process.env.GC_DELIVERY_PIN);
 const result=await client.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));
 assert.equal(result.VersionId,pin.version);
 const {providerToken,teamId}=JSON.parse(result.SecretString);assert.equal(teamId,3);
 const api=managedProviderApi({origin,token:providerToken});
 const data=await (await api('/envelope')).json();assert(Array.isArray(data.data));assert.equal(data.data.length,0);
 for(const headers of [{},{Authorization:'Bearer api_'+'0'.repeat(48)}]){
  const denied=await fetch(origin+'/api/v2/envelope',{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  assert([401,403].includes(denied.status));await denied.body?.cancel();
 }
 console.log(JSON.stringify({privateProviderAuthenticated:true,envelopes:0,unauthorizedDenials:2,writes:0}));
}catch{console.error('Private provider authentication probe failed; private details suppressed');process.exitCode=1;}
finally{client.destroy();}
