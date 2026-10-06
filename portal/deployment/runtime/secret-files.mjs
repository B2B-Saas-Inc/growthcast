import {openSync, closeSync, fstatSync, readFileSync, lstatSync, constants} from 'node:fs';

const fields = {
  atrium: ['BETTER_AUTH_SECRET'],
  documenso: ['NEXTAUTH_SECRET', 'NEXT_PRIVATE_ENCRYPTION_KEY', 'NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY'],
};
function privateFile(path, uid) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o777) !== 0o400 || stat.size > 4096) throw Error('Invalid private file');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}
export function applicationEnvironment({service, mode, applicationEnv, directory = '/run/secrets/material', uid = process.getuid()}) {
  if (mode === undefined || mode === '') return applicationEnv;
  if (mode !== 'materialized' || !Object.hasOwn(fields, service) || uid === 0) throw Error('Invalid secret mode');
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o777) !== 0o700) throw Error('Invalid private directory');
  const secrets = JSON.parse(privateFile(directory + '/application-secret-env.json', uid));
  if (!secrets || Array.isArray(secrets) || Object.keys(secrets).sort().join(',') !== [...fields[service]].sort().join(',')) throw Error('Invalid secret fields');
  if (!applicationEnv || typeof applicationEnv !== 'object' || Array.isArray(applicationEnv)) throw Error('Invalid application environment');
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) || Object.hasOwn(applicationEnv, key)) throw Error('Invalid or duplicate secret');
  }
  if (service === 'atrium') {
    const origin = privateFile(directory + '/api-origin', uid);
    if (!/^[a-f0-9]{64}$/.test(origin) || origin !== readFileSync('/run/origin/api-origin', 'utf8').trim()) throw Error('Origin proof handoff mismatch');
  }
  return {...applicationEnv, ...secrets};
}
