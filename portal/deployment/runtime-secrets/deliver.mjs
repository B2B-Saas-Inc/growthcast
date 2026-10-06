import {readFileSync,writeFileSync,lstatSync,rmSync} from 'node:fs';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {fromContainerMetadata} from '@aws-sdk/credential-providers';
import {materialize} from './material.mjs';

const pins = JSON.parse(readFileSync(new URL('./runtime-pins.json',import.meta.url),'utf8'));
export function deliveryConfiguration(service,env=process.env,uid=process.getuid()) {
  if (!Object.hasOwn(pins,service) || uid !== pins[service].uid) throw Error('Runtime delivery identity refused');
  if (!/^\/v2\/credentials\/[a-f0-9-]{36}$/.test(env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ?? '') ||
      ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_CONTAINER_CREDENTIALS_FULL_URI'].some(key=>env[key])) throw Error('ECS task credentials required');
  return {...pins[service]};
}
export async function deliver({service,env=process.env,uid=process.getuid(),directory='/run/delivered/material',originDirectory='/run/origin',client}) {
  const pin=deliveryConfiguration(service,env,uid);
  const parent=lstatSync(directory.slice(0,directory.lastIndexOf('/')));
  if (!parent.isDirectory() || parent.uid!==uid || (parent.mode&0o777)!==0o700) throw Error('Private delivery volume required');
  if (service==='atrium') {
    const origin=lstatSync(originDirectory);
    if (!origin.isDirectory() || origin.uid!==uid || (origin.mode&0o777)!==0o700) throw Error('Private origin volume required');
  }
  const ownClient=client??new SecretsManagerClient({region:'us-east-1',endpoint:'https://secretsmanager.us-east-1.amazonaws.com',maxAttempts:3,credentials:fromContainerMetadata({timeout:2000,maxRetries:2})});
  let created=false,originCreated=false;
  try {
    const value=await ownClient.send(new GetSecretValueCommand({SecretId:pin.arn,VersionId:pin.version}));
    if(value.ARN!==pin.arn || value.VersionId!==pin.version || typeof value.SecretString!=='string') throw Error('Pinned secret response required');
    materialize(JSON.parse(value.SecretString),service,directory);created=true;
    if(service==='atrium') {
      writeFileSync(originDirectory+'/api-origin',readFileSync(directory+'/api-origin'),{flag:'wx',mode:0o400});originCreated=true;
    }
    return {directory,version:pin.version,cleanup:()=>{
      if(originCreated)rmSync(originDirectory+'/api-origin');
      rmSync(directory,{recursive:true});
    }};
  } catch {
    if(originCreated)rmSync(originDirectory+'/api-origin',{force:true});
    if(created)rmSync(directory,{recursive:true,force:true});
    throw Error('Runtime secret delivery refused');
  } finally {if(!client)ownClient.destroy();}
}
