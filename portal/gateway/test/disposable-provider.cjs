// Only the existing fixture database or the isolated packaged-provider fixture.
module.exports = function disposableProvider(url) {
  const legacy = ['database','signing-database'].includes(url.hostname) && url.pathname === '/documenso_test';
  const packaged = process.env.PORTAL_MANAGED_RUNTIME_TEST === '1' &&
    url.hostname === 'db.abcdefghijklmnopqrst.supabase.co' && url.pathname === '/postgres' &&
    url.username === 'gc_documenso' && url.searchParams.get('schema') === 'gc_documenso' &&
    url.searchParams.get('sslaccept') === 'strict';
  if (!legacy && !packaged) throw Error('Disposable provider database required');
};
