/* eslint-disable @typescript-eslint/no-require-imports -- Executes the compiled package helper. */
const assert = require('node:assert/strict');
const {createCapturedMail} = require('/upstream/apps/api/dist/mail/capture-mail.js');
(async () => {
  assert.equal(createCapturedMail({get:()=>undefined}),null);
  assert.throws(()=>createCapturedMail({get:()=> 'unknown'}),/Unsupported/);
  assert.throws(()=>createCapturedMail({get:key=>key==='PORTAL_MAIL_MODE'?'capture':'smtp.example.com'}),/Unsupported capture host/);
  const send = createCapturedMail({get:key=>key==='PORTAL_MAIL_MODE'?'capture':undefined});
  for (const address of ['person@example.com','Person <person@growthcast.invalid>',
    'person@growthcast.invalid,other@example.com','person@growthcast.invalid\r\nBcc: other@example.com']) {
    await assert.rejects(()=>send(address,'Synthetic subject','Synthetic body'),/Staging recipient denied/);
  }
  console.log('Packaged mail policy rejects external, multi-recipient and injected addresses without network access.');
})();
