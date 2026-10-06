// Polling never overlaps a prior cycle. Stop drains the current operation; it
// must not abort an in-flight provider/SMTP effect and silently retry it.
export function startDeliveryWorker({delivery,intervalMs=1000,onFailure=()=>{}}){
 if(typeof delivery?.runOnce!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<10||intervalMs>60000||typeof onFailure!=='function')throw Error('Delivery worker configuration required');
 let stopped=false,timer,active=Promise.resolve();
 const tick=()=>{
  if(stopped)return;
  active=(async()=>{try{await delivery.runOnce();}catch{try{onFailure('Document delivery worker cycle failed');}catch{/* A logger cannot break scheduling. */}}})();
  void active.then(()=>{if(!stopped)timer=setTimeout(tick,intervalMs);});
 };
 tick();
 return {async stop(){stopped=true;clearTimeout(timer);await active;}};
}
