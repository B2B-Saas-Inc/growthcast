import {chromium} from 'playwright';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://portal.growthcast.test:8444';
const deadline=Date.now()+180000;
while(!existsSync('/runtime/browser-ready.json')) {
  if(Date.now()>deadline)throw Error('API fixture not ready');
  await new Promise(resolve=>setTimeout(resolve,500));
}
const fixture=JSON.parse(readFileSync('/runtime/browser-ready.json','utf8'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  for(const [label,viewport] of [['desktop',{width:1280,height:850}],['mobile',{width:390,height:844}]]) {
    const context=await browser.newContext({viewport,ignoreHTTPSErrors:true});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/login');
    await page.getByLabel('Email',{exact:true}).fill('client@growthcast.invalid');
    await page.getByLabel('Password',{exact:true}).fill('synthetic-password-1234');
    await page.getByRole('button',{name:/sign in/i}).click();
    await page.waitForURL('**/portal/projects',{timeout:30000});
    await page.getByRole('link',{name:'Documents',exact:true}).click();
    await page.getByRole('heading',{name:'GrowthCast synthetic agreement'}).waitFor();
    await page.screenshot({path:'/runtime/catalog-'+label+'.png',fullPage:true});
    assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth>globalThis.innerWidth),false,label+' horizontal overflow');
    const result=await page.request.get(origin+'/api/portal/catalog');
    assert.deepEqual(Object.keys((await result.json())[0]).sort(),['id','status','title','type']);
    await page.screenshot({path:'/runtime/catalog-'+label+'.png',fullPage:true});
    const cookies=await context.cookies(origin);
    assert(cookies.some(c=>c.name==='__Secure-better-auth.session_token'&&c.secure&&c.httpOnly));
    await page.getByRole('button',{name:'View document',exact:true}).click();
    await page.waitForURL(url=>url.origin==='https://signing.growthcast.test:8443'&&url.pathname.startsWith('/sign/'+fixture.recipientToken));
    if(fixture.provider) {
      await page.getByText('Document Signed',{exact:true}).waitFor();
      const pdfPath=`/api/files/token/${fixture.recipientToken}/envelope/${fixture.envelopeId}/envelopeItem/${fixture.itemId}/dataId/${fixture.dataId}/current/item.pdf`;
      const pdf=await page.request.get('https://signing.growthcast.test:8443'+pdfPath);
      assert.equal(pdf.status(),200);
      assert.equal(createHash('sha256').update(await pdf.body()).digest('hex'),fixture.sha256);
      const copied=await browser.newContext({ignoreHTTPSErrors:true});
      assert.equal((await copied.request.get('https://signing.growthcast.test:8443'+pdfPath)).status(),404);
      await copied.close();
    } else await page.getByRole('heading',{name:'Synthetic completed agreement'}).waitFor();
    assert.equal(new URL(page.url()).hash,'');
    const gatewayCookies=await context.cookies(page.url());
    assert(gatewayCookies.some(c=>c.name==='__Host-gc-sign'&&c.httpOnly&&c.secure));
    assert(!gatewayCookies.some(c=>c.name.includes('better-auth')));
    assert(!cookies.some(c=>c.name==='__Host-gc-sign'));
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const anonymous=await browser.newContext({ignoreHTTPSErrors:true});
  const page=await anonymous.newPage();
  await page.goto(origin+'/portal/documents');
  await page.waitForURL('**/login');
  assert.equal((await page.request.get('https://signing.growthcast.test:8443/sign/catalog-recipient')).status(),404);
  // Use a different, verified project client through the real sign-in route.
  await page.getByLabel('Email',{exact:true}).fill('http-other-client@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-password-1234');
  await page.getByRole('button',{name:/sign in/i}).click();
  await page.waitForURL('**/portal/projects');
  await page.goto(origin+'/portal/documents');
  await page.getByText('No documents are available for this account.').waitFor();
  const denied=await page.evaluate(async id=>{
    const csrf=globalThis.document.cookie.split('; ').find(x=>x.startsWith('csrf-token='))?.split('=')[1]||'';
    return (await fetch('/api/portal/catalog/'+id+'/open',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:'{}'})).status;
  },fixture.documentId);
  assert.equal(denied,403);
  await anonymous.close();
  console.log((fixture.provider?'Canonical sealed PDF hashes and anonymous PDF denial passed. ':'')+'Atrium desktop/mobile catalog, real login, HTTPS handoff, cookie isolation and cross-client denial passed.');
} finally {writeFileSync('/runtime/browser-done','done');await browser.close();}
