import {openSync,closeSync,fstatSync,lstatSync,readFileSync,constants} from 'node:fs';
import {runtimeConfig} from '../../deployment/runtime/config.mjs';
export function privateRead(path) {
 const uid=process.getuid(),directory=path.slice(0,path.lastIndexOf('/')),parent=lstatSync(directory);
 if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==uid||(parent.mode&0o777)!==0o700)throw Error('Private runtime directory required');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==uid||(stat.mode&0o777)!==0o400||stat.size>16384)throw Error('Private runtime file required');return readFileSync(fd,'utf8').trim();}finally{closeSync(fd);}
}
export function readConfiguration(directory='/run/guest') {return configuration(name=>privateRead(directory+'/'+name),directory+'/database-ca.crt');}
export function readDeliveryConfiguration(directory='/run/signing',authPath='/run/delivered/material/application-secret-env.json'){
 const value=JSON.parse(privateRead(directory+'/delivery.json'));
 if(Object.keys(value).sort().join()!=='encryptionKey,organizationId,providerToken,teamId'||typeof value.organizationId!=='string'||!value.organizationId||value.organizationId.length>200||!Number.isSafeInteger(value.teamId)||value.teamId<1||!/^api_[a-f0-9]{48}$/.test(value.providerToken)||! /^[a-f0-9]{64}$/.test(value.encryptionKey))throw Error('Private staging delivery configuration required');
 const auth=JSON.parse(privateRead(authPath));
 if(Object.keys(auth).join()!=='BETTER_AUTH_SECRET'||! /^[a-f0-9]{64}$/.test(auth.BETTER_AUTH_SECRET))throw Error('Delivered workspace authentication secret required');
 return {...value,encryptionKey:Buffer.from(value.encryptionKey,'hex'),authSecret:auth.BETTER_AUTH_SECRET};
}
export function readSharedConfiguration() {
 const paths={'database-url':'/run/connections/material/database-url','database-ca.crt':'/run/connections/material/database-ca.crt','origin-proof':'/run/origin/api-origin','storage.json':'/run/storage/credentials.json'};
 const config={projectRef:'saedetvoolpdysiyjwvg',portalOrigin:'https://clients.staging.growthcast.app',apiOrigin:'https://api.clients.staging.growthcast.app',bucket:'gc-atrium-private'};
 return configuration(name=>name==='config.json'?JSON.stringify(config):privateRead(paths[name]),paths['database-ca.crt']);
}
function configuration(read,caPath) {
 const config=JSON.parse(read('config.json'));
 if(Object.keys(config).sort().join()!=='apiOrigin,bucket,portalOrigin,projectRef'||config.projectRef!=='saedetvoolpdysiyjwvg'||config.portalOrigin!=='https://clients.staging.growthcast.app'||typeof config.apiOrigin!=='string'||!config.apiOrigin.startsWith('https://')||new URL(config.apiOrigin).origin!==config.apiOrigin||config.bucket!=='gc-atrium-private')throw Error('Explicit staging configuration required');
 const originProof=read('origin-proof');if(!/^[a-f0-9]{64}$/.test(originProof))throw Error('Runtime ingress proof required');
 const database=runtimeConfig({service:'atrium',url:read('database-url'),projectRef:config.projectRef,ca:read('database-ca.crt'),caPath});
 return {database,application:{apiOrigin:config.apiOrigin,portalOrigin:config.portalOrigin,originProof,storageConfiguration:{projectRef:config.projectRef,bucket:config.bucket,credentials:JSON.parse(read('storage.json'))}}};
}
