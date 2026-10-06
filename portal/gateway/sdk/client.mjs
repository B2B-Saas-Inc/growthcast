/* global window, document, location, history */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmbedSignDocument } from '@documenso/embed-react';
const signingOrigin='https://signing.growthcast.test:8443';
const token=location.hash.slice(1);
history.replaceState(null,'','/');
// The pinned SDK checks source Window, but not origin. Reject messages from
// a navigated frame before they reach the SDK listener. Events are UI only;
// canonical completion still comes from server-side provider read-back.
window.addEventListener('message',event=>{
  if(event.source===document.querySelector('iframe')?.contentWindow && event.origin!==signingOrigin)event.stopImmediatePropagation();
},true);
function SigningFixture() {
  const [state,setState]=useState('loading');
  useEffect(()=>{
    if(state!=='loading')return;
    // A gateway denial is plain HTTP, so the upstream page cannot emit an SDK
    // error event. Bound the wait and show a useful failure state either way.
    const timeout=setTimeout(()=>setState('error'),10000);
    return ()=>clearTimeout(timeout);
  },[state]);
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(token))return React.createElement('p',null,'Signing session unavailable.');
  return React.createElement(React.Fragment,null,
    React.createElement('h1',null,'GrowthCast signing'),
    React.createElement('p',{id:'sdk-status',role:'status','data-state':state},state==='error'?'Signing session unavailable. Return to your document link and enter your PIN again.':state==='completed'?'Signature submitted. Final document verification is pending.':`Signing status: ${state}`),
    // Stop the live SDK after a terminal event. Final PDFs are exposed only
    // after trusted reconciliation, not by a recipient-frame reload race.
    ['loading','ready'].includes(state)?React.createElement(EmbedSignDocument,{token,host:signingOrigin,lockName:true,lockEmail:true,
      onDocumentReady:()=>setState('ready'),onDocumentCompleted:()=>setState('completed'),
      onDocumentRejected:()=>setState('rejected'),onDocumentError:()=>setState('error')}):null);
}
createRoot(document.getElementById('root')).render(React.createElement(SigningFixture));
