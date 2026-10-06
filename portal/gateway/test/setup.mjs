import { readFile, writeFile } from 'node:fs/promises';
import { createStore } from '../src/store.mjs';
import { createEnvelope, bindingFor, api } from './provider.mjs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPinAccess } from '../src/pin.mjs';
const store=createStore(process.env.DATABASE_URL);
try {
  let ready=false;
  for(let i=0;i<30;i++) {
    try {ready=(await fetch('http://documenso:3000/api/health',{signal:AbortSignal.timeout(1000)})).ok;} catch { /* Startup only; never retry provider writes. */ }
    if(ready)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready)throw Error('Provider did not become healthy');
  await store.pool.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  if(process.argv[2]==='expire-sessions') {
    const {rows}=await store.pool.query('SELECT token_hash,expires_at FROM sessions WHERE expires_at>now()');
    await writeFile('/runtime/session-expiry-snapshot.json',JSON.stringify(rows));
    await store.pool.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
    console.log('Fixture sessions expired without revoking grants.');
  } else if(process.argv[2]==='restore-sessions') {
    const rows=JSON.parse(await readFile('/runtime/session-expiry-snapshot.json','utf8'));
    for(const row of rows) {
      assert.ok(Date.parse(row.expires_at)>Date.now(),'Never extend the original session lifetime');
      await store.pool.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1',[row.token_hash,row.expires_at]);
    }
    console.log('Original fixture expiry timestamps restored; no lifetime extension.');
  } else if(process.argv[2]==='revoke') {
    const fixtures=JSON.parse(await readFile('/runtime/fixtures.json','utf8'));
    for(const group of fixtures) for(const s of group.signers) await store.revoke(s.grant.id);
    console.log('Fixture grants revoked.');
  } else if(process.argv[2]==='reconcile') {
    const fixtures=JSON.parse(await readFile('/runtime/fixtures.json','utf8'));
    const verified=JSON.parse(await readFile('/runtime/verified-artifacts.json','utf8'));
    for(const group of fixtures) {
      const envelope=await (await api('/envelope/'+group.envelopeId,{},group.providerIndex)).json();
      assert.equal(envelope.id,group.envelopeId);
      assert.equal(envelope.status,group.name==='rejection'?'REJECTED':'COMPLETED');
      const items=envelope.envelopeItems.map(i=>({id:i.id,dataId:i.documentDataId}));
      assert.equal(items.length,1,'Fixture has one immutable source PDF');
      const bytes=Buffer.from(await (await api('/envelope/item/'+items[0].id+'/download',{},group.providerIndex)).arrayBuffer());
      const sha256=createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha256,verified[group.name],'Canonical artifact must match cryptographically verified bytes');
      for(const s of group.signers) {
        const recipient=envelope.recipients.find(r=>r.id===s.binding.recipientId);
        assert.ok(recipient);
        const current=await bindingFor(envelope,recipient,group);
        assert.deepEqual({...current,items:s.binding.items},s.binding,'Recipient/document/version scope cannot change');
        assert.deepEqual(items.map(i=>i.id),s.binding.items.map(i=>i.id));
        await store.recordSealedArtifact(s.grant.id,s.binding,{...items[0],sha256});
        s.sealedItems=items;
      }
    }
    await writeFile('/runtime/fixtures.json',JSON.stringify(fixtures));
    console.log('Verified final artifacts reconciled without changing approved source bindings.');
  } else if(process.argv[2]==='verify') {
    const fixtures=JSON.parse(await readFile('/runtime/fixtures.json','utf8'));
    for(const group of fixtures) {
      let envelope;
      for(let attempt=0;attempt<30;attempt++) {
        envelope=await (await api('/envelope/'+group.envelopeId,{},group.providerIndex)).json();
        if(envelope.status===(group.name==='rejection'?'REJECTED':'COMPLETED'))break;
        await new Promise(r=>setTimeout(r,1000));
      }
      if(group.name==='rejection') {
        assert.equal(envelope.status,'REJECTED');
        assert.ok(envelope.recipients.some(r=>r.signingStatus==='REJECTED'));
      } else if(envelope.status!=='COMPLETED'||!envelope.recipients.every(r=>r.signingStatus==='SIGNED'))throw Error('Envelope not fully completed');
      const artifact=await api('/envelope/item/'+envelope.envelopeItems[0].id+'/download',{},group.providerIndex);
      await writeFile(`/runtime/${group.name}-sealed.pdf`,Buffer.from(await artifact.arrayBuffer()));
      await writeFile(`/runtime/${group.name}-canonical.json`,JSON.stringify({teamId:envelope.teamId,envelopeId:envelope.id,documentId:Number(envelope.secondaryId.split('_')[1]),status:envelope.status,itemId:envelope.envelopeItems[0].id,dataId:envelope.envelopeItems[0].documentDataId}));
      const audit=await api('/envelope/'+group.envelopeId+'/audit-log/download',{},group.providerIndex);
      const auditBytes=Buffer.from(await audit.arrayBuffer());
      assert.equal(auditBytes.subarray(0,5).toString(),'%PDF-');
      await writeFile(`/runtime/${group.name}-audit.pdf`,auditBytes);
      assert.ok(!auditBytes.includes(Buffer.from('/ByteRange')),'Pinned audit export is generated, not independently signed');
      console.log(group.name+': generated audit PDF has no cryptographic signature; integrity is not independently attested.');
      console.log(group.name+': terminal status, sealed PDF and audit download verified through provider API.');
    }
    const rejection=fixtures.find(g=>g.name==='rejection');
    const rejected=await (await api('/envelope/'+rejection.envelopeId,{},rejection.providerIndex)).json();
    if(!rejected.recipients.some(r=>r.signingStatus==='REJECTED'))throw Error('Rejection not recorded');
    console.log('Rejection recorded by provider.');
  } else {
    const fixtures=[];
    for(const [name,order] of [['sequential','SEQUENTIAL'],['parallel','PARALLEL'],['rejection','PARALLEL'],['sdk','PARALLEL']]) {
      const scope={providerIndex:['rejection','sdk'].includes(name)?1:0,clientId:name==='parallel'?'client-b':'client-a'};
      const envelope=await createEnvelope(order,scope.providerIndex);
      const signers=[];
      for(const recipient of [...envelope.recipients].sort((a,b)=>a.signingOrder-b.signingOrder))signers.push({binding:await bindingFor(envelope,recipient,scope)});
      fixtures.push({name,envelopeId:envelope.id,signers,...scope});
    }
    await assert.rejects(()=>api('/envelope/'+fixtures[0].envelopeId,{},1),/returned (403|404)/);
    await assert.rejects(()=>api('/envelope/'+fixtures[2].envelopeId,{},0),/returned (403|404)/);
    console.log('Provider API credentials cannot read the other organization’s envelope.');
    for(const group of fixtures)for(const s of group.signers) {
      const grant=await store.issue(s.binding);
      s.grant={id:grant.id};
      s.access=await createPinAccess(store).provision(grant.id);
    }
    await writeFile('/runtime/fixtures.json',JSON.stringify(fixtures));
    console.log('Four API-created envelopes and eight recipient grants prepared.');
  }
} finally {await store.pool.end();}
