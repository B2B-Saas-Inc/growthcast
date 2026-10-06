import {lstatSync,writeFileSync,unlinkSync} from 'node:fs';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
const directories={delivery:'/run/signing',gateway:'/run/gateway',lifecycle:'/run/lifecycle'};
export async function signingSecrets({kind,pins,client,env=process.env,uid=process.getuid(),directory=directories[kind]}){
 if(!Object.hasOwn(directories,kind)||uid!==1000||pins?.[kind]?.uid!==uid||!/^\/v2\/credentials\/[a-f0-9-]{36}$/.test(env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI??'')||['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_CONTAINER_CREDENTIALS_FULL_URI'].some(k=>env[k]))throw Error('Dedicated signing task credentials required');
 const pin=pins[kind];if(!/^arn:aws:secretsmanager:us-east-1:059393269249:secret:growthcast\/portal\/staging\/signing\//.test(pin.arn)||! /^[a-f0-9-]{36}$/.test(pin.version))throw Error('Pinned staging signing secret required');
 const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o777)!==0o700)throw Error('Private signing directory required');
 const own=client??new SecretsManagerClient({region:'us-east-1',endpoint:'https://secretsmanager.us-east-1.amazonaws.com',credentials:fromContainerMetadata({timeout:2000,maxRetries:2}),maxAttempts:3});
 const created=[];const cleanup=()=>{for(const file of created.splice(0))unlinkSync(file);};
 try{
  const result=await own.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));
  if(result.ARN!==pin.arn||result.VersionId!==pin.version||typeof result.SecretString!=='string'||result.SecretString.length>16000)throw Error();
  const value=JSON.parse(result.SecretString);
  let files;
  if(kind==='lifecycle'){
   if(Object.keys(value).sort().join()!=='config,trustPem'||typeof value.trustPem!=='string'||!value.trustPem.startsWith('-----BEGIN CERTIFICATE-----')||value.trustPem.includes('PRIVATE KEY'))throw Error();
   files={'config.json':JSON.stringify(value.config),'signing-trust.pem':value.trustPem};
  }else files={[kind==='delivery'?'delivery.json':'connection.json']:JSON.stringify(value)};
  for(const [name,data] of Object.entries(files)){const file=directory+'/'+name;writeFileSync(file,data,{flag:'wx',mode:0o400});created.push(file);}
  return {directory,cleanup};
 }catch{cleanup();throw Error('Signing secret delivery refused');}
 finally{if(!client)own.destroy();}
}
