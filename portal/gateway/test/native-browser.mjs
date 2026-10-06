/* global window, PointerEvent, document */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const origin='https://signing.growthcast.test:8443';
const fixtures=JSON.parse(await readFile('/runtime/fixtures.json','utf8'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
const inventory=new Set();
const sessions=[];
const requests=new Map();
async function open(signer, mobile=false, storageState) {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:mobile?{width:390,height:844}:{width:1440,height:1000},storageState});
  const page=await context.newPage(); page.setDefaultTimeout(12000);
  page.on('request',request=>{
    const url=new URL(request.url());
    if(url.origin===origin && ['/sign/','/embed/sign/','/api/files/','/api/trpc/'].some(p=>url.pathname.startsWith(p))) {
      const record={grantId:signer.grant.id,path:url.pathname+url.search,method:request.method(),body:request.postData()};
      requests.set(JSON.stringify(record),record);
    }
  });
  page.on('requestfailed',request=>{if(request.failure()?.errorText!=='net::ERR_ABORTED')errors.push(request.failure()?.errorText+' '+new URL(request.url()).pathname.replaceAll(signer.binding.recipientToken,'[recipient]'));});
  page.on('pageerror',e=>errors.push(e.message.slice(0,100)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,100));});
  page.on('response',r=>{
    const url=new URL(r.url());
    const route=url.pathname.replaceAll(signer.binding.recipientToken,'[recipient]').replaceAll(signer.binding.envelopeId,'[envelope]');
    if(!route.startsWith('/assets/'))inventory.add(`${r.request().method()} ${route}`);
    if(r.status()>=400)errors.push(`${r.status()} ${route}${url.pathname==='/__manifest'?' paths='+String(url.searchParams.get('paths')).replaceAll(signer.binding.recipientToken,'[recipient]'):''}`);
  });
  if(storageState)await page.goto(origin+`/sign/${signer.binding.recipientToken}`);
  else {
    await page.goto(origin+'/unlock#'+signer.access.share);
    await page.waitForURL(origin+'/unlock');
    const html=await page.content();
    for(const privateValue of [signer.binding.recipientEmail,signer.binding.envelopeId,signer.binding.recipientToken,signer.access.share])assert.ok(!html.includes(privateValue));
    const badPin=String((Number(signer.access.pin)+1)%100000000).padStart(8,'0');
    assert.equal((await context.request.post(origin+'/unlock',{headers:{Origin:origin},data:{share:signer.access.share,pin:badPin}})).status(),404);
    await page.screenshot({path:`/runtime/${mobile?'mobile':'desktop'}-pin.png`,fullPage:true});
    await page.getByLabel('Access PIN').fill(signer.access.pin);
    await page.getByRole('button',{name:'Continue to signing',exact:true}).click();
  }
  await page.waitForURL(/\/sign\//);
  const auth=(await context.cookies()).find(c=>c.name==='__Host-gc-sign');
  assert.ok(auth?.secure&&auth.httpOnly&&auth.sameSite==='Strict'&&auth.path==='/');
  sessions.push({signer,storageState:await context.storageState()});
  // Let route-manifest discovery finish before the harness navigates or closes the page.
  await page.waitForLoadState("networkidle");
  return {page,context};
}
async function sign(page,signer,label,frame=page) {
  if(page.viewportSize().width<600) {
    await frame.getByRole('button',{name:'Expand',exact:true}).click();
  }
  await frame.getByTestId('signature-pad-dialog-button').filter({visible:true}).click();
  await frame.getByTestId('signature-pad-type-input').fill(signer.binding.recipientName);
  await frame.getByRole('button',{name:'Next',exact:true}).click();
  if(frame!==page && page.viewportSize().width<600)await frame.getByRole('button',{name:'Collapse',exact:true}).click();
  await frame.getByRole('button',{name:'Next Field',exact:true}).click();
  // Konva fields have no DOM controls: use the server-bound scene-node ID.
  await frame.waitForFunction(id=>window.Konva?.stages.some(s=>s.findOne('#'+id)),signer.binding.fieldIds[0]);
  if(frame!==page)await page.screenshot({path:`/runtime/${label}-ready.png`,fullPage:true});
  if(frame===page)await frame.evaluate(id=>window.Konva.stages.map(s=>s.findOne('#'+id)).find(Boolean).fire('pointerdown',{evt:new PointerEvent('pointerdown')}),signer.binding.fieldIds[0]);
  else {
    const point=await frame.evaluate(id=>{
      const node=window.Konva.stages.map(s=>s.findOne('#'+id)).find(Boolean);
      const rect=node.getClientRect(),canvas=node.getStage().container().getBoundingClientRect();
      const x=canvas.left+rect.x+rect.width/2,y=canvas.top+rect.y+rect.height/2;
      return {x,y,hit:document.elementFromPoint(x,y)?.tagName};
    },signer.binding.fieldIds[0]);
    assert.equal(point.hit,'CANVAS','SDK signature field must be visible and unobstructed');
    const box=await page.locator('iframe').boundingBox();assert.ok(box);
    await page.mouse.click(box.x+point.x,box.y+point.y);
  }
  await frame.getByRole('button',{name:'Complete',exact:true}).click();
  await frame.getByRole('button',{name:'Sign',exact:true}).click();
  if(frame===page)await frame.getByRole('heading',{name:'Document Signed',exact:true}).waitFor();
  else await page.locator('#sdk-status[data-state=completed]').waitFor();
  await page.waitForLoadState("networkidle");
  await page.screenshot({path:`/runtime/${label}.png`,fullPage:true});
}
async function denyRecorded(records,saved,mode) {
  let count=0;
  for(const record of records) {
    const targets=mode==='wrong-recipient'?saved.filter(s=>s.signer.grant.id!==record.grantId):saved.filter(s=>s.signer.grant.id===record.grantId);
    for(const target of targets) {
    const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:mode==='anonymous'?undefined:target.storageState});
    const csrf=target.storageState.cookies.find(c=>c.name==='__Host-gc-csrf').value;
    const response=await context.request.fetch(origin+record.path,{method:record.method,data:record.body||undefined,
      headers:{Origin:origin,'Content-Type':'application/json','X-GrowthCast-CSRF':csrf},maxRedirects:0});
    assert.equal(response.status(),404,`${mode} ${record.method} captured private request must be denied`);
    assert.equal(response.headers()['cache-control'],'private, no-store');
    count++;
    await context.close();
    }
  }
  console.log(`${mode}: ${count} captured private request replays denied.`);
}
try {
  if(process.argv[2]==='boundary') {
    const saved=JSON.parse(await readFile('/runtime/sessions.json','utf8'));
    let probes=0;
    for(const {signer,storageState} of saved) {
      const b=fixtures.flatMap(g=>g.signers).find(s=>s.grant.id===signer.grant.id);
      const token=b.binding.recipientToken, envelope=b.binding.envelopeId, item=b.sealedItems[0];
      const currentPdf=`/api/files/token/${token}/envelope/${envelope}/envelopeItem/${item.id}/dataId/${item.dataId}/current/item.pdf`;
      for(const other of saved.filter(s=>s.signer.grant.id!==signer.grant.id)) {
        const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:other.storageState});
        for(const method of ['GET','HEAD']) {
          assert.equal((await context.request.fetch(origin+currentPdf,{method,headers:{Range:'bytes=0-4'}})).status(),404,'Current sealed PDF must deny another recipient');probes++;
        }
        await context.close();
      }
      const paths=[
        `/api/files/token/${token}/envelopeItem/${item.id}`,
        `/api/files/token/${token}/envelopeItem/${item.id}/download/current`,
        `/api/files/token/qr_${token}/envelopeItem/${item.id}`,
        `/api/files/envelope/${envelope}/envelopeItem/${item.id}?token=${token}`,
        `/api/files/envelope/${envelope}/envelopeItem/${item.id}/download/current`,
        `/api/v2/envelope/${envelope}/audit-log/download`,
        `/api/v2/envelope/${envelope}`,
        `/api/certificate-status?token=${token}`,
        `/__htmltopdf/audit-log?token=${token}`,
        `/__htmltopdf/certificate?token=${token}`,
        `/embed/direct/${token}`,
        `/embed/v1/multisign`,
        `/embed/v2/authoring/envelope/edit/${envelope}`,
        `/sign/${token}.data`,
        `/api/trpc/document.getDocument?input=${encodeURIComponent(JSON.stringify({json:{documentId:b.binding.documentId}}))}`,
        `/api/files/token/${token}/envelope/${envelope}/envelopeItem/${item.id}/dataId/wrong-data/current/item.pdf`,
        `/api/files/token/${token}/envelope/wrong-envelope/envelopeItem/${item.id}/dataId/${item.dataId}/current/item.pdf`,
        `/api/files/token/${token}/envelope/${envelope}/envelopeItem/wrong-item/dataId/${item.dataId}/current/item.pdf`,
      ];
      for(const state of [undefined,storageState]) {
        const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:state});
        for(const path of paths)for(const method of ['GET','HEAD']) {
          const r=await context.request.fetch(origin+path,{method,headers:{Range:'bytes=0-4'},maxRedirects:0});
          assert.equal(r.status(),404,'Alternate route or substituted ID must be denied');
          assert.equal(r.headers()['cache-control'],'private, no-store');probes++;
        }
        await context.close();
      }
    }
    console.log(`Boundary matrix: ${probes} alternate-route/altered-ID/current-sealed-cross-recipient GET/HEAD/Range probes denied with and without valid sessions.`);
  } else if(['replay','resume','expired'].includes(process.argv[2])) {
    const saved=JSON.parse(await readFile('/runtime/sessions.json','utf8'));
    const records=JSON.parse(await readFile('/runtime/requests.json','utf8'));
    if(process.argv[2]!=='resume')await denyRecorded(records,saved,process.argv[2]==='expired'?'expired':'revoked');
    for(const {signer,storageState} of saved) {
      const context=await browser.newContext({ignoreHTTPSErrors:true,storageState});
      const current=fixtures.flatMap(g=>g.signers).find(s=>s.grant.id===signer.grant.id);
      assert.ok(current?.sealedItems);
      const b={...signer.binding,items:current.sealedItems};
      for(const p of [`/sign/${b.recipientToken}`,`/sign/${b.recipientToken}/complete`,`/api/files/token/${b.recipientToken}/envelope/${b.envelopeId}/envelopeItem/${b.items[0].id}/dataId/${b.items[0].dataId}/current/item.pdf`]) {
        for(const method of ['GET','HEAD']) {
          const r=await context.request.fetch(origin+p,{method,headers:{Range:'bytes=0-4'}});
          assert.equal(r.status(),process.argv[2]==='resume'?200:404,`${process.argv[2]} ${method} ${p.replaceAll(b.recipientToken,'[recipient]').replaceAll(b.envelopeId,'[envelope]')} client=${b.recipientName}`);assert.equal(r.headers()['cache-control'],'private, no-store');
        }
      }
      await context.close();
    }
    console.log(process.argv[2]==='resume'?'Native sessions and PDF access survived gateway restart.':'Inactive native browser sessions denied for signing and PDF GET/HEAD/Range.');
  } else {
    assert.equal(new Set(fixtures.flatMap(g=>g.signers.map(s=>s.binding.organizationId))).size,2);
    assert.notEqual(fixtures[0].signers[0].binding.clientId,fixtures[1].signers[0].binding.clientId);
    const anon=await browser.newContext({ignoreHTTPSErrors:true});
    await assert.rejects(()=>anon.request.get('http://documenso:3000/api/health',{timeout:2000}));
    for(const group of fixtures)for(const s of group.signers)assert.equal((await anon.request.get(origin+`/sign/${s.binding.recipientToken}`)).status(),404);
    const sequential=fixtures[0];const waiting=await open(sequential.signers[1],true);
    await waiting.page.waitForURL(/\/waiting$/);
    const client=await open(sequential.signers[0]);
    assert.equal((await client.context.request.get(origin+`/sign/${sequential.signers[1].binding.recipientToken}`)).status(),404);
    await sign(client.page,sequential.signers[0],'desktop-client');
    await waiting.page.goto(origin+`/sign/${sequential.signers[1].binding.recipientToken}`);
    await sign(waiting.page,sequential.signers[1],'mobile-countersigner');
    await client.context.close();await waiting.context.close();
    for(const [i,signer] of [...fixtures[1].signers].reverse().entries()) {
      const view=await open(signer,i===0);await sign(view.page,signer,'parallel-'+i);await view.context.close();
    }
    const reject=fixtures[2].signers[0];const view=await open(reject);
    await view.page.getByRole('button',{name:'Reject Document',exact:true}).click();
    await view.page.getByRole('textbox',{name:'Please provide a reason for rejecting this document'}).fill('Synthetic rejection test');
    await view.page.getByRole('dialog',{name:'Reject Document'}).getByRole('button',{name:'Reject Document',exact:true}).click();
    await view.page.getByRole('heading',{name:'Document Rejected',exact:true}).waitFor();
    await view.page.waitForLoadState('networkidle');
    await view.context.close();
    const copied=await anon.newPage();
    await copied.goto('https://portal.growthcast.test:9443/#'+fixtures.find(g=>g.name==='sdk').signers[0].binding.recipientToken);
    await copied.locator('#sdk-status[data-state=error]').waitFor({timeout:12000});
    await copied.close();await anon.close();
    for(const [i,signer] of fixtures.find(g=>g.name==='sdk').signers.entries()) {
      const {page,context}=await open(signer,i===1);
      const parent='https://portal.growthcast.test:9443';
      assert.deepEqual(await context.cookies(parent),[],'Signing cookies must remain host-only');
      await page.goto(parent+'/#'+signer.binding.recipientToken);
      await page.locator('#sdk-status[data-state=ready]').waitFor();
      const frame=page.frames().find(f=>f.url().startsWith(origin+'/embed/sign/'));
      assert.ok(frame);
      assert.ok(await frame.evaluate(()=>{try {return !window.parent.document;}catch{return true;}}),'Different origins must isolate DOM access');
      await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:document.querySelector('iframe').contentWindow,origin:'https://untrusted.growthcast.test:9443',data:{action:'document-completed'}})));
      assert.equal(await page.locator('#sdk-status').getAttribute('data-state'),'ready','Wrong-origin messages cannot complete the UI');
      const evil=await context.newPage();
      const blocked=evil.waitForEvent('console',{predicate:m=>m.text().includes('frame-ancestors'),timeout:12000});
      await evil.goto('https://untrusted.growthcast.test:9443/#'+signer.binding.recipientToken);
      await blocked;await evil.close();
      await sign(page,signer,'sdk-'+i,frame);
      await context.close();
    }
    console.log('Official SDK ready/completed callbacks passed at desktop/mobile widths across separate origins.');
    await writeFile('/runtime/sessions.json',JSON.stringify(sessions));
    await writeFile('/runtime/requests.json',JSON.stringify([...requests.values()]));
    await denyRecorded([...requests.values()],sessions,'anonymous');
    await denyRecorded([...requests.values()],sessions,'wrong-recipient');
    await writeFile('/runtime/route-inventory.json',JSON.stringify([...inventory].sort(),null,2));
    console.log('BROWSER ERRORS',JSON.stringify(errors));assert.deepEqual(errors,[]);
  }
} finally {await browser.close();}
