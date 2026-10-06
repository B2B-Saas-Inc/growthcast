/* global window, PointerEvent, document, getComputedStyle */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const fixture=JSON.parse(await readFile('/private/'+(process.argv[3]==='required'?'required-browser.json':'browser.json'),'utf8'));
const origin='https://api.clients.staging.growthcast.app';
const signatureId=fixture.binding.fieldIds.find(id=>fixture.binding.fieldTypes[String(id)]==='SIGNATURE');assert.ok(signatureId);
let page;const resourceErrors=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:process.argv[4]==='mobile'?{width:390,height:844}:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(20000);
 const redact=value=>String(value).replaceAll(fixture.binding.recipientToken,'[recipient]').replaceAll(fixture.access.share,'[share]').replaceAll(fixture.access.pin,'[pin]');
 page.on('pageerror',error=>console.error('Page error: '+redact(error.message).slice(0,500)));
 page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Content Security Policy'))resourceErrors.push('CSP violation');if(message.type()==='error')console.error('Browser error: '+redact(message.text()).slice(0,500));});
 page.on('response',response=>{if(response.status()>=400)console.error('Response '+response.status()+' '+redact(new URL(response.url()).pathname));});
 page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).pathname.startsWith('/api/trpc/')){console.error('Signing RPC status '+response.status()+' '+new URL(response.url()).pathname);const raw=response.request().postDataJSON();const w=raw?.json?raw:raw?.['0'];console.error(JSON.stringify({fieldId:w?.json?.fieldId,type:w?.json?.fieldValue?.type,authType:w?.json?.authOptions?.type,keys:Object.keys(w?.json??{}),meta:w?.meta}));};});
 assert.equal((await context.request.get(origin+'/sign/'+fixture.binding.recipientToken)).status(),404);
 await page.goto(origin+'/unlock#'+fixture.access.share);await page.screenshot({path:'/private/pin-desktop.png'});if(process.argv[2]!=='optional'&&fixture.requirePin!==false){await page.getByLabel('Access PIN').fill(fixture.access.pin);await page.getByRole('button',{name:'Continue to signing',exact:true}).click();}await page.waitForURL(/\/sign\//);
 if(process.argv[2]==='download'){
  const b=fixture.binding,item=fixture.sealed;
  const path=`/api/files/token/${b.recipientToken}/envelope/${b.envelopeId}/envelopeItem/${item.id}/dataId/${item.dataId}/current/item.pdf`;
  const result=await context.request.get(origin+path);assert.equal(result.status(),200);assert.equal(createHash('sha256').update(await result.body()).digest('hex'),item.sha256);
  const anonymous=await browser.newContext({ignoreHTTPSErrors:false});assert.equal((await anonymous.request.get(origin+path)).status(),404);await anonymous.close();
  console.log('Client downloaded the verified sealed PDF through the scoped gateway; anonymous download was denied.');
  await page.getByRole('heading',{name:'Document Signed',exact:true}).waitFor();
  await page.getByRole('button',{name:'Download',exact:true}).click();
  for(const [label,version] of [['Original','initial'],['Signed','current']]){
   const expected=await context.request.get(origin+`/api/files/token/${b.recipientToken}/envelope/${b.envelopeId}/envelopeItem/${item.id}/dataId/${item.dataId}/${version}/item.pdf`);assert.equal(expected.status(),200);
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:label,exact:true}).click()]);
   assert.equal(await download.failure(),null);const downloaded=await readFile(await download.path());assert.equal(downloaded.subarray(0,5).toString(),'%PDF-');
   assert.equal(createHash('sha256').update(downloaded).digest('hex'),createHash('sha256').update(await expected.body()).digest('hex'));
   if(label==='Signed')assert.equal(createHash('sha256').update(downloaded).digest('hex'),item.sha256);
   const visitor=await browser.newContext();assert.equal((await visitor.request.get(origin+`/api/files/token/${b.recipientToken}/envelopeItem/${item.id}/download/${label.toLowerCase()}`)).status(),404);await visitor.close();
  }
  console.log('Actual Original and Signed dialog buttons downloaded PDFs with matching original and verified signed hashes.');
  if(fixture.faviconSha256){
   for(const iconPath of ['/growthcast-favicon-v2.jpg','/favicon-32x32.png','/favicon-16x16.png','/apple-touch-icon.png']){
    const icon=await context.request.get(origin+iconPath);assert.equal(icon.status(),200);assert.equal(icon.headers()['content-type'],'image/jpeg');assert.equal(createHash('sha256').update(await icon.body()).digest('hex'),fixture.faviconSha256);
   }
   const manifest=await context.request.get(origin+'/site.webmanifest');assert.equal((await manifest.json()).name,'GrowthCast');
   assert.deepEqual(resourceErrors,[]);console.log('Signing favicon and touch-icon responses match the existing GrowthCast portal icon, with no CSP violations.');
  }


 }else{
 await page.waitForFunction(()=>document.querySelector('nav img[src^="/api/branding/logo/"]')?.naturalWidth>0);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.documenso-branded')).fontFamily.includes('Manrope'));
 await page.screenshot({path:'/private/signing-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/signing-mobile.png'});await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.locator('nav img[src^="/api/branding/logo/"]').count(),1);
 await page.waitForTimeout(1500);
 await page.getByTestId('signature-pad-dialog-button').filter({visible:true}).click();
 await page.getByRole('dialog').waitFor({state:'visible'});
 if(!await page.getByTestId('signature-pad-type-input').isVisible())await page.getByRole('tab',{name:'Type',exact:true}).click();
 await page.getByTestId('signature-pad-type-input').fill('NONBINDING TEST ONLY');await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByRole('button',{name:'Next Field',exact:true}).click();
 await page.waitForFunction(id=>window.Konva?.stages.some(s=>s.findOne('#'+id)),signatureId);
 await page.evaluate(id=>window.Konva.stages.map(s=>s.findOne('#'+id)).find(Boolean).fire('pointerdown',{evt:new PointerEvent('pointerdown')}),signatureId);
 const textId=fixture.binding.fieldIds.find(id=>fixture.binding.fieldTypes[String(id)]==='TEXT');assert.ok(textId);
 await page.waitForFunction(id=>window.Konva?.stages.some(s=>s.findOne('#'+id)),textId);
 await page.evaluate(id=>window.Konva.stages.map(s=>s.findOne('#'+id)).find(Boolean).fire('pointerdown',{evt:new PointerEvent('pointerdown')}),textId);
 await page.locator('#custom-text').fill('GrowthCast nonbinding test');await page.getByRole('button',{name:'Enter',exact:true}).click();
 await page.getByRole('button',{name:'Complete',exact:true}).click();await page.getByRole('button',{name:'Sign',exact:true}).click();
 await page.getByRole('heading',{name:'Document Signed',exact:true}).waitFor();
 console.log('The branded live recipient page loaded its assets, accepted the required company field and completed the nonbinding signature.');
 }
}catch(error){await page?.screenshot({path:'/private/signing-failure.png'}).catch(()=>{});console.error('Visible actions: '+JSON.stringify(await page?.getByRole('button').allTextContents()));console.error('Client signing browser failed: '+String(error.message).replaceAll(fixture.binding.recipientToken,'[recipient]').replaceAll(fixture.access.share,'[share]').replaceAll(fixture.access.pin,'[pin]').slice(0,1200));process.exitCode=1;}
finally{await browser.close();}
