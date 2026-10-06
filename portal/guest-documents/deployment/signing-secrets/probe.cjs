const {SecretsManagerClient,GetSecretValueCommand}=require('/boundary/node_modules/@aws-sdk/client-secrets-manager');
const {fromContainerMetadata}=require('/boundary/node_modules/@aws-sdk/credential-providers');
const assert=require('node:assert/strict');
const pins=JSON.parse(process.env.GC_SIGNING_PINS),kind=process.env.GC_SIGNING_KIND;
const client=new SecretsManagerClient({region:'us-east-1',credentials:fromContainerMetadata(),maxAttempts:2});
(async()=>{
 let passed=0;
 for(const [name,pin] of Object.entries(pins)){
  if(name===kind){const result=await client.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));assert.equal(result.VersionId,pin.version);const value=JSON.parse(result.SecretString);
   if(kind==='delivery'){assert.equal(value.teamId,3);assert.match(value.encryptionKey,/^[a-f0-9]{64}$/);}
   else{const connection=kind==='gateway'?value:value.config.connection;assert.equal(connection.projectRef,'saedetvoolpdysiyjwvg');assert.match(new URL(connection.url).username,new RegExp('^gc_'+kind+'(?:\\.|$)'));}
  }else{
   let denied=false;try{await client.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));}catch(e){denied=e.name==='AccessDeniedException';}assert(denied);
  }passed++;
 }
 console.log(JSON.stringify({kind,passed}));
})().catch(()=>{console.error('Signing credential boundary probe failed');process.exitCode=1;}).finally(()=>client.destroy());
