import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import route from '/upstream/documenso/apps/remix/server/api/files/routes/get-envelope-item-pdf-by-token.ts';
import accountRoute from '/upstream/documenso/apps/remix/server/api/files/routes/get-envelope-item-pdf.ts';
import { fixture, pdf } from './infrastructure-fixture.mjs';

function path({ token = fixture.token, envelope = fixture.envelopeId, item = fixture.itemId,
  data = fixture.dataId, version = 'current' } = {}) {
  return `/token/${token}/envelope/${envelope}/envelopeItem/${item}/dataId/${data}/${version}/item.pdf`;
}
beforeEach(() => {
  fixture.accessAuth = ['TWO_FACTOR_AUTH'];
  fixture.storageReads = 0;
  fixture.sessionReads = 0;
});

// These characterize an incompatibility, NOT a passing release security gate.
for (const method of [[], ['TWO_FACTOR_AUTH'], ['ACCOUNT']]) {
  test(`BLOCKER: token PDF bypasses configured access auth ${JSON.stringify(method)}`, async () => {
    fixture.accessAuth = method;
    const response = await route.request(path());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf);
    assert.equal(fixture.sessionReads, 0);
    assert.equal(fixture.storageReads, 1);
  });
}
test('BLOCKER: initial artifact also accepts the bearer token alone', async () => {
  const response = await route.request(path({ version: 'initial' }));
  assert.equal(response.status, 200);
  assert.equal(fixture.storageReads, 1);
});
test('BLOCKER: token PDF response permits one-year private caching', async () => {
  const response = await route.request(path());
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
});
test('BLOCKER: HEAD reaches the artifact without recipient authentication', async () => {
  const response = await route.request(path(), { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(fixture.sessionReads, 0);
  assert.equal(fixture.storageReads, 1);
  assert.equal(await response.text(), '');
});
test('BLOCKER: Range request still receives PDF bytes without recipient authentication', async () => {
  const response = await route.request(path(), { headers: { Range: 'bytes=0-4' } });
  assert.equal(response.status, 200); // upstream serves full file, not partial content
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf);
});
for (const [name, override] of Object.entries({
  'wrong token': { token: 'wrong' },
  'wrong envelope': { envelope: 'another-envelope' },
  'wrong item': { item: 'another-item' },
  'wrong data': { data: 'another-data' },
})) {
  test(`control: ${name} is denied before storage access`, async () => {
    const response = await route.request(path(override));
    assert.equal(response.status, 404);
    assert.equal(fixture.storageReads, 0);
  });
}
test('control: invalid version is rejected by the actual upstream validator', async () => {
  const response = await route.request(path({ version: 'invalid' }));
  assert.equal(response.status, 400);
  assert.equal(fixture.storageReads, 0);
});
test('control: corresponding account route denies anonymous access', async () => {
  const accountPath = path().replace(`/token/${fixture.token}`, '');
  const response = await accountRoute.request(accountPath);
  assert.equal(response.status, 404);
  assert.equal(fixture.sessionReads, 1);
  assert.equal(fixture.storageReads, 0);
});
