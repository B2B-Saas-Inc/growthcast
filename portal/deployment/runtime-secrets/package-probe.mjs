import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {deliver} from './deliver.mjs';
import {applicationEnvironment} from '../runtime/secret-files.mjs';
import {childEnvironment} from '../runtime/config.mjs';
let material;
try {
 const service=process.env.GC_SERVICE;
 material=await deliver({service});
 const application=applicationEnvironment({service,mode:'materialized',directory:material.directory,applicationEnv:{}});
 const child=childEnvironment(application,{});
 assert(!Object.keys(child).some(key=>key.startsWith('AWS_')));
 const count=Object.keys(child).length;
 assert.equal(count,service==='atrium'?1:3);
 material.cleanup();material=undefined;
 assert(!existsSync('/run/delivered/material'));assert(!existsSync('/run/origin/api-origin'));
 console.log(JSON.stringify({stage:'VERIFIED',service,uid:process.getuid(),applicationSecretFields:count,taskRoleOnly:true,privateFileConsumption:true,plaintextRemoved:true}));
}catch{material?.cleanup();console.error('Packaged secret delivery refused; details suppressed');process.exitCode=1;}
