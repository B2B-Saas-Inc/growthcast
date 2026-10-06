import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeConfig, childEnvironment, verifyRuntime} from './config.mjs';

const projectRef = 'abcdefghijklmnopqrst';
const input = {service: 'atrium', projectRef, ca: 'synthetic CA', caPath: '/run/secrets/database-ca.crt',
  url: `postgresql://gc_app.${projectRef}:synthetic%40password@aws-0-us-east-1.pooler.supabase.com:5432/postgres`};

test('runtime role is exact and privileged/cross-service credentials fail closed', () => {
  for (const role of ['postgres', 'gc_migrate', 'gc_documenso_migrate', 'gc_gateway', 'gc_lifecycle', 'gc_documenso', 'gc_backup']) {
    assert.throws(() => runtimeConfig({...input, url: input.url.replace('gc_app.', role + '.')}), /identity/);
  }
  assert.throws(() => runtimeConfig({...input, service: '__proto__'}), /Unsupported/);
});

test('session and direct connections retain strict TLS and private Prisma namespace', () => {
  for (const service of ['atrium', 'documenso']) {
    const role = service === 'atrium' ? 'gc_app' : 'gc_documenso';
    for (const host of [`${role}.${projectRef}:pw@aws-0-us-east-1.pooler.supabase.com`, `${role}:pw@db.${projectRef}.supabase.co`]) {
      const value = runtimeConfig({...input, service, url: `postgresql://${host}:5432/postgres`});
      assert.equal(value.config.ssl.rejectUnauthorized, true);
      assert.equal(value.config.options, '-c search_path=' + (service === 'atrium' ? 'gc_atrium' : 'gc_documenso') + ',pg_catalog');
      for (const url of Object.values(value.databaseEnv)) {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get('schema'), service === 'atrium' ? 'gc_atrium' : 'gc_documenso');
        assert.equal(parsed.searchParams.get('sslaccept'), 'strict');
        assert.equal(parsed.searchParams.get('sslcert'), input.caPath);
      }
    }
  }
});

test('unverified TLS, transaction pooling and wrong project are refused', () => {
  for (const change of [{ca: ''}, {caPath: 'relative.crt'}, {url: input.url.replace('5432', '6543')},
    {url: input.url + '?sslmode=disable'}, {url: input.url + '?schema=public'},
    {projectRef: 'zyxwvutsrqponmlkjihg'}]) assert.throws(() => runtimeConfig({...input, ...change}));
});

test('child environment accepts explicit application settings and refuses inherited overrides', () => {
  const {databaseEnv} = runtimeConfig(input);
  assert.deepEqual(childEnvironment({NODE_ENV: 'production'}, databaseEnv), {NODE_ENV: 'production', ...databaseEnv});
  for (const key of ['DATABASE_URL', 'PGPASSWORD', 'SUPABASE_ACCESS_TOKEN', 'AWS_SECRET_ACCESS_KEY',
    'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'BUN_OPTIONS', 'LD_PRELOAD', 'DIRECT_URL']) {
    assert.throws(() => childEnvironment({[key]: 'secret'}, databaseEnv));
  }
  for (const value of [null, [], 'string', {PORT: 8080}]) assert.throws(() => childEnvironment(value, databaseEnv));
});

const healthy = {role: 'gc_app', schema: 'gc_atrium', readonly: 'on', ssl: true, version: 170006, elevated: false, memberships: false};
function database(status = healthy) {
  const calls = [];
  return {calls, connect: async () => {calls.push('connect');},
    query: async sql => {calls.push(['BEGIN READ ONLY', 'ROLLBACK'].includes(sql) ? sql : 'query'); return {rows: [status]};},
    end: async () => {calls.push('end');}};
}
test('only verified identity reaches schema guard and connection closes before launch', async () => {
  const db = database();
  await verifyRuntime(db, runtimeConfig(input).expected, async () => db.calls.push('guard'));
  assert.deepEqual(db.calls, ['connect', 'BEGIN READ ONLY', 'query', 'guard', 'ROLLBACK', 'end']);
});
test('server identity, role escalation, TLS and namespace failures never reach guard', async () => {
  for (const change of [{role: 'postgres'}, {schema: 'public'}, {readonly: 'off'}, {ssl: false},
    {version: 160000}, {elevated: true}, {memberships: true}]) {
    const db = database({...healthy, ...change});
    await assert.rejects(verifyRuntime(db, runtimeConfig(input).expected, async () => assert.fail('guard must not run')));
    assert.deepEqual(db.calls, ['connect', 'BEGIN READ ONLY', 'query', 'ROLLBACK', 'end']);
  }
});
test('incomplete migrations, schema drift and connection failure close database and reject launch', async () => {
  for (const failure of ['Schema drift', 'Migration checksum/history mismatch']) {
    const db = database();
    await assert.rejects(verifyRuntime(db, runtimeConfig(input).expected, async () => {throw Error(failure);}), {message: failure});
    assert.equal(db.calls.at(-1), 'end');
  }
  const db = database();
  db.connect = async () => {throw Error('TLS certificate failure');};
  await assert.rejects(verifyRuntime(db, runtimeConfig(input).expected, async () => assert.fail()));
  assert.deepEqual(db.calls, ['end']);
});

 test('a pooled writable default cannot make schema verification writable', async () => {
  let readOnly = false;
  const db = database();
  db.query = async sql => {
    if (sql === 'BEGIN READ ONLY') readOnly = true;
    else if (sql === 'ROLLBACK') readOnly = false;
    else if (sql.startsWith('INSERT')) {
      if (readOnly) throw Object.assign(Error('read-only transaction'), {code: '25006'});
      assert.fail('verification must never write');
    }
    return {rows: [{...healthy, readonly: readOnly ? 'on' : 'off'}]};
  };
  await verifyRuntime(db, runtimeConfig(input).expected, async guarded => {
    await assert.rejects(guarded.query('INSERT INTO synthetic VALUES (1)'), {code: '25006'});
  });
  assert.equal(readOnly, false);
  assert.equal(db.calls.at(-1), 'end');
});
