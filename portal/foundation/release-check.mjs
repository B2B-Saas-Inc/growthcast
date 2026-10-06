import {readFile} from 'node:fs/promises';
export function blockers(config,env) {
  const errors=[];
  if(!['staging','production'].includes(env.PORTAL_ENV))errors.push('PORTAL_ENV');
  if(config.schemaVersion!==1||config.status!=='approved')errors.push('release approval');
  for(const key of ['atriumHostingDecision','documensoLicenseDecision','certificatePolicy','managedSecretProvider'])if(typeof config[key]!=='string'||!config[key].trim())errors.push(key);
  for(const service of ['web','api','gateway','worker','documenso'])if(!/^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(config.images?.[service]||''))errors.push(service+' image digest');
  for(const key of ['WEB_URL','API_URL','GATEWAY_ORIGIN']) {
    try {const url=new URL(env[key]);if(url.protocol!=='https:'||url.origin!==env[key]||url.username||url.password||url.hostname.endsWith('.invalid')||url.hostname==='localhost')throw Error();}
    catch {errors.push(key);}
  }
  if(env.WEB_URL===env.GATEWAY_ORIGIN)errors.push('separate signing origin');
  if(env.ALLOW_SIGNUPS!=='false'||env.SECURE_COOKIES!=='true')errors.push('account/cookie policy');
  return errors;
}
if(process.argv[1]?.endsWith('/release-check.mjs')) {
  const errors=blockers(JSON.parse(await readFile(new URL('./release.json',import.meta.url),'utf8')),process.env);
  if(errors.length) {console.error('Release blocked: '+errors.join(', '));process.exitCode=1;}
  else console.log('Configuration references validated; this command does not deploy or attest external approvals.');
}
