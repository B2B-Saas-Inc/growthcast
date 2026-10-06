/* global document, getComputedStyle, innerWidth */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const required=JSON.parse(await readFile('/private/required-browser.json','utf8')),optional=JSON.parse(await readFile('/private/browser.json','utf8'));
const origin='https://api.clients.staging.growthcast.app',browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();let failedAssets=0;
 page.on('response',r=>{if(r.status()>=400&&(/\.(css|js|ttf|png)$/.test(new URL(r.url()).pathname)))failedAssets++;});
 await page.goto(origin+'/unlock#'+required.access.share);await page.getByLabel('Access PIN').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);assert.equal(await page.locator('header img').evaluate(img=>img.naturalWidth>0),true);
 assert.ok((await page.locator('body').evaluate(node=>getComputedStyle(node).fontFamily)).includes('Manrope'));
 await page.screenshot({path:'/private/pin-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/pin-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto('about:blank');await page.goto(origin+'/unlock#'+optional.access.share);await page.waitForURL(/\/sign\//);await page.getByRole('heading',{name:'Document Signed',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.getByRole('button',{name:'Share',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Download',exact:true}).count(),1);assert.equal(failedAssets,0);assert.ok((await page.locator('.documenso-branded').evaluate(node=>getComputedStyle(node).fontFamily)).includes('Manrope'));
 await writeFile('/private/visual-result.json',JSON.stringify({requiredPinBranded:true,mobileNoHorizontalOverflow:true,optionalPinAutomaticallyOpens:true,failedAssets,completedPageBranded:true}));console.log('Live branded PIN desktop/mobile and code-free access passed; zero failed assets');
}finally{await browser.close();}
