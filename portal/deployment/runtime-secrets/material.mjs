import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
const fields={atrium:['BETTER_AUTH_SECRET','PORTAL_API_ORIGIN'],documenso:['NEXTAUTH_SECRET','NEXT_PRIVATE_ENCRYPTION_KEY','NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY']};
export function validateMaterial(value,service){
 assert(Object.hasOwn(fields,service),'Unsupported service');
 assert(value&&typeof value==='object'&&!Array.isArray(value),'Material object required');
 assert.deepEqual(Object.keys(value).sort(),['schemaVersion','secrets','service']);
 assert.equal(value.schemaVersion,1);assert.equal(value.service,service);
 assert(value.secrets&&typeof value.secrets==='object'&&!Array.isArray(value.secrets));
 assert.deepEqual(Object.keys(value.secrets).sort(),[...fields[service]].sort());
 for(const secret of Object.values(value.secrets))assert.match(secret,/^[a-f0-9]{64}$/);
 return {...value.secrets};
}
export function materialize(value,service,directory){
 const secrets=validateMaterial(value,service);
 assert(directory.startsWith('/')&&!existsSync(directory),'Fresh absolute material directory required');
 mkdirSync(directory,{mode:0o700});chmodSync(directory,0o700);
 const origin=secrets.PORTAL_API_ORIGIN;delete secrets.PORTAL_API_ORIGIN;
 writeFileSync(directory+'/application-secret-env.json',JSON.stringify(secrets),{flag:'wx',mode:0o400});
 if(origin)writeFileSync(directory+'/api-origin',origin,{flag:'wx',mode:0o400});
 return {service,files:origin?2:1};
}
