import test from 'node:test';
import assert from 'node:assert/strict';
import disposableProvider from './disposable-provider.cjs';

test('provider bootstrap accepts only the explicit disposable database targets', () => {
  const previous = process.env.PORTAL_MANAGED_RUNTIME_TEST;
  try {
    delete process.env.PORTAL_MANAGED_RUNTIME_TEST;
    disposableProvider(new URL('postgresql://postgres@database/documenso_test'));
    disposableProvider(new URL('postgresql://postgres@signing-database/documenso_test'));
    assert.throws(()=>disposableProvider(new URL('postgresql://postgres@signing-database/postgres')));
    const url = new URL('postgresql://gc_documenso:synthetic@db.abcdefghijklmnopqrst.supabase.co/postgres?schema=gc_documenso&sslaccept=strict');
    assert.throws(() => disposableProvider(url));
    process.env.PORTAL_MANAGED_RUNTIME_TEST = '1';
    disposableProvider(url);
    for (const [key, value] of [['hostname','db.saedetvoolpdysiyjwvg.supabase.co'], ['username','postgres'], ['pathname','/another_database']]) {
      const changed = new URL(url); changed[key] = value;
      assert.throws(() => disposableProvider(changed));
    }
    for (const [key,value] of [['schema','public'],['sslaccept','accept_invalid_certs']]) {
      const changed = new URL(url); changed.searchParams.set(key,value);
      assert.throws(() => disposableProvider(changed));
    }
  } finally {
    if (previous === undefined) delete process.env.PORTAL_MANAGED_RUNTIME_TEST;
    else process.env.PORTAL_MANAGED_RUNTIME_TEST = previous;
  }
});
