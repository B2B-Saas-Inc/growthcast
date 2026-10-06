import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {applicationEnvironment} from './secret-files.mjs';
import {runtimeConfig, childEnvironment, verifyRuntime} from './config.mjs';
import {guard as atriumGuard} from '../supabase/managed-atrium/migrate.mjs';
import {guard as documensoGuard} from '../supabase/managed-documenso/migrate.mjs';

let delivered, connections;
try {
  const service = process.env.GC_SERVICE;
  const command = process.argv[2];
  if (!command?.startsWith('/')) throw Error('Absolute runtime command required');
  let mode = process.env.GC_SECRET_MODE;
  if (mode === 'secretsmanager') {
    const {deliver} = await import('../runtime-secrets/deliver.mjs');
    delivered = await deliver({service});
    const {deliverConnections} = await import('../runtime-connections/deliver.mjs');
    connections = await deliverConnections({service});
    mode = 'materialized';
  }
  const databaseDirectory = connections?.directory ?? '/run/secrets';
  const caPath = databaseDirectory + '/database-ca.crt';
  const {config, expected, databaseEnv} = runtimeConfig({service,
    projectRef: process.env.SUPABASE_PROJECT_REF,
    url: readFileSync(databaseDirectory + '/database-url', 'utf8').trim(),
    ca: readFileSync(caPath, 'utf8'), caPath});
  const env = childEnvironment(applicationEnvironment({service, mode, directory: delivered?.directory,
    applicationEnv: JSON.parse(readFileSync(connections ? '/run/config/application-env.json' : '/run/secrets/application-env.json', 'utf8'))}), databaseEnv);
  await verifyRuntime(new pg.Client(config), expected, service === 'atrium' ? atriumGuard : documensoGuard);
  const child = spawn(command, process.argv.slice(3), {env, stdio: 'inherit'});
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {connections?.cleanup(); connections = undefined; delivered?.cleanup(); delivered = undefined;console.error('Runtime launch failed; details suppressed'); process.exitCode = 1;});
  child.on('exit', (code, signal) => {connections?.cleanup(); connections = undefined; delivered?.cleanup(); delivered = undefined;process.exitCode = code ?? (signal === 'SIGTERM' ? 143 : signal === 'SIGINT' ? 130 : 1);});
} catch {
  connections?.cleanup(); connections = undefined; delivered?.cleanup();
  console.error('Runtime startup refused; details suppressed');
  process.exitCode = 1;
}
