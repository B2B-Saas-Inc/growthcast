import {supabaseConnection} from '../supabase-config.mjs';

const services = {
  atrium: {role: 'gc_app', schema: 'gc_atrium'},
  documenso: {role: 'gc_documenso', schema: 'gc_documenso'},
};

export function runtimeConfig({service, url, projectRef, ca, caPath}) {
  if (!Object.hasOwn(services, service)) throw Error('Unsupported runtime service');
  if (!ca?.trim() || !caPath?.startsWith('/')) throw Error('Mounted CA required');
  const expected = services[service];
  const config = supabaseConnection({url, projectRef, ca});
  const role = config.user.endsWith('.' + projectRef)
    ? config.user.slice(0, -projectRef.length - 1) : config.user;
  if (role !== expected.role) throw Error('Dedicated runtime identity required');
  config.application_name = 'growthcast-startup-' + service;
  // Do not leave a read-only session default on a backend later reused by Prisma.
  // verifyRuntime applies READ ONLY to its explicit transaction instead.
  config.options = '-c search_path=' + expected.schema + ',pg_catalog';
  const prisma = new URL(url);
  prisma.search = '';
  prisma.searchParams.set('schema', expected.schema);
  prisma.searchParams.set('sslmode', 'require');
  prisma.searchParams.set('sslaccept', 'strict');
  prisma.searchParams.set('sslcert', caPath);
  const databaseEnv = service === 'documenso'
    ? {NEXT_PRIVATE_DATABASE_URL: prisma.href, NEXT_PRIVATE_DIRECT_DATABASE_URL: prisma.href}
    : {DATABASE_URL: prisma.href, DIRECT_URL: prisma.href};
  return {config, expected, databaseEnv};
}

// The caller supplies an explicit application environment; inherited credentials
// and database/TLS overrides must not cross the startup boundary.
export function childEnvironment(applicationEnv, databaseEnv) {
  if (!applicationEnv || Array.isArray(applicationEnv) || typeof applicationEnv !== 'object') throw Error('Application environment object required');
  for (const key of Object.keys(applicationEnv)) {
    if (key !== 'NODE_ENV' && /DATABASE|DIRECT_URL|^PG|^SUPABASE|^AWS_|^NODE_|^BUN_|^LD_|^DYLD_|^SSL_CERT|^GC_/.test(key)) {
      throw Error('Forbidden application environment setting');
    }
    if (typeof applicationEnv[key] !== 'string') throw Error('Environment values must be strings');
  }
  return {...applicationEnv, ...databaseEnv};
}

export async function verifyRuntime(db, expected, guard) {
  let transaction = false;
  try {
    await db.connect();
    // Pooled backends may retain an earlier session default. Enforce the
    // verification boundary on this transaction, independently of startup options.
    await db.query('BEGIN READ ONLY');
    transaction = true;
    const {rows: [status]} = await db.query(`SELECT current_user AS role,
      current_schema() AS schema, current_setting('transaction_read_only') AS readonly,
      current_setting('server_version_num')::int AS version,
      ssl, (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        FROM pg_roles WHERE rolname=current_user) AS elevated,
      EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS memberships
      FROM pg_stat_ssl WHERE pid=pg_backend_pid()`);
    if (!status || status.role !== expected.role || status.schema !== expected.schema ||
      status.readonly !== 'on' || !status.ssl || status.elevated !== false || status.memberships !== false || Math.floor(status.version / 10000) !== 17) {
      throw Error('Runtime database boundary mismatch');
    }
    await guard(db);
  } finally {
    if (transaction) await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}
