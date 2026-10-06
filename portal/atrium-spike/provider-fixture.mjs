import { readFileSync } from 'node:fs';
import { verifyReceipt } from './proof.mjs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

function approvedFixture(config) {
  const proof=verifyReceipt(config.receipt,config.publicKey,config);
  return {...config,verifiedSha256:proof.sha256,proof,api:async path=>{
    if(config.synthetic) {
      return path.endsWith('/download')?new Response(Buffer.from('%PDF- synthetic completion fixture')):Response.json(config.envelope);
    }
    const response=await fetch('http://provider:3000/api/v2'+path,{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw Error('Canonical provider readback failed');
    if(!path.endsWith('/download')) {
      const envelope=await response.json();
      if(envelope.envelopeItems?.length!==1||envelope.envelopeItems[0].documentDataId!==proof.dataId)throw Error('Receipt artifact changed');
      return Response.json(envelope);
    }
    return response;
  }};
}
export function providerFixture(email) {
  if(process.env.WORKER_ISOLATED==='1')return approvedFixture(JSON.parse(readFileSync('/worker-config/provider.json','utf8')));
  if (process.env.PORTAL_PROVIDER === '1') {
    const group = JSON.parse(readFileSync('/provider-runtime/fixtures.json','utf8')).find(g => g.name === 'sequential');
    const binding = group.signers.find(s => s.binding.recipientEmail === email).binding;
    const provider = JSON.parse(readFileSync('/provider-runtime/provider.json','utf8'))[group.providerIndex];
    const receipt=JSON.parse(readFileSync('/provider-runtime/verification-receipts.json','utf8'))[group.name];
    const publicKey=readFileSync('/provider-runtime/verifier-public.pem','utf8');
    return approvedFixture({binding,teamId:provider.teamId,token:provider.token,receipt,publicKey});
  }
  const binding={environment:'local-test',organizationId:'http-org',clientId:'http-project',documentVersion:'fixture-v1',envelopeId:'catalog-envelope',documentId:2,recipientId:2,recipientToken:'catalog-recipient',recipientName:'Synthetic',recipientEmail:email,fieldIds:[],items:[{id:'catalog-item',dataId:'catalog-data'}]};
  const bytes=Buffer.from('%PDF- synthetic completion fixture');
  const envelope={id:binding.envelopeId,teamId:1,secondaryId:'document_2',status:'COMPLETED',recipients:[{id:2,token:binding.recipientToken,name:binding.recipientName,email,signingStatus:'SIGNED'}],fields:[],envelopeItems:[{id:'catalog-item',documentDataId:'catalog-sealed-data'}]};
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const issuedAt=Date.now();
  const payload=Buffer.from(JSON.stringify({schemaVersion:1,audience:'growthcast-local-lifecycle',environment:'local-test',teamId:1,envelopeId:binding.envelopeId,documentId:binding.documentId,itemId:binding.items[0].id,dataId:'catalog-sealed-data',sha256:createHash('sha256').update(bytes).digest('hex'),status:'COMPLETED',issuedAt,expiresAt:issuedAt+3600000}));
  return approvedFixture({binding,teamId:1,synthetic:true,envelope,publicKey:publicKey.export({type:'spki',format:'pem'}),receipt:{payload:payload.toString('base64url'),signature:sign(null,payload,privateKey).toString('base64url')}});
}
