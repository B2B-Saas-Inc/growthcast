// Operator-side controlled acceptance only. Never included by runtime image COPY.
import {readFileSync,writeFileSync} from 'node:fs';
import {deliverySecrets} from '../signing/secrets.mjs';
const source=JSON.parse(readFileSync('/private/access-source.json'));
const secrets=deliverySecrets(Buffer.from(source.key,'hex'));
const binding=secrets.open(source.id,source.binding),access=secrets.open(source.id,source.access);
if(binding.recipientEmail!=='ewhite@growthcast.app'||binding.versionId!==source.version)throw Error('Controlled recipient binding required');
writeFileSync('/private/browser.json',JSON.stringify({sendId:source.id,binding,access}),{mode:0o600});
console.log('Controlled recipient access decoded into private browser fixture');
