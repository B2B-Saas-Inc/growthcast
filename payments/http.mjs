import {createReceiver} from './receiver.mjs';
export function createHttpHandler({getRuntime,env=process.env,bodyTimeoutMs=5000}) {
 const receive=createReceiver({enabled:env.PAYMENTS_TEST_ENABLED==='true',secret:env.STRIPE_TEST_SIGNING_SECRET,ledger:{accept:async event=>(await getRuntime()).ledger.accept(event)}});
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.writeHead(405).end();return;}
  if(env.PAYMENTS_TEST_ENABLED!=='true'){res.writeHead(503).end();return;}
  let size=0;const chunks=[];
  const timer=setTimeout(()=>{if(!res.headersSent)res.writeHead(408).end();req.destroy();},bodyTimeoutMs);
  try {
   for await(const chunk of req){size+=chunk.length;if(size>262144){res.writeHead(413).end();return;}chunks.push(chunk);}
   clearTimeout(timer);
   const result=await receive(Buffer.concat(chunks),req.headers['stripe-signature']);
   if(!res.headersSent)res.writeHead(result.status).end();
  }catch{if(!res.headersSent)res.writeHead(503).end();}
  finally{clearTimeout(timer);}
 };
}
