// Used by the future Next.js /api/[...path] Node route. No build-time secrets.
const requestHeaders=['accept','accept-language','content-type','cookie','origin','referer','range','if-range','x-csrf-token'];
const responseHeaders=['x-content-type-options','content-security-policy','content-type','content-disposition','content-range','accept-ranges','www-authenticate'];
const maxBody=3*1024*1024;
export function createApiProxy({webOrigin,apiOrigin,originSecret,fetchImpl=fetch}) {
  const web=new URL(webOrigin),api=new URL(apiOrigin);
  if(web.origin!==webOrigin||api.origin!==apiOrigin||web.protocol!=='https:'||api.protocol!=='https:'||api.hostname!=='api.'+web.hostname||!/^[a-zA-Z0-9]{64}$/.test(originSecret??''))throw Error('Invalid portal origin configuration');
  return async request=>{
    const url=new URL(request.url);
    const fail=status=>Response.json({message:status>=500?'The portal is temporarily unavailable. Please try again shortly.':'Request unavailable.'},{status,headers:{'cache-control':'private, no-store'}});
    if(url.origin!==webOrigin||!url.pathname.startsWith('/api/')||/%2f|%5c|%2e/i.test(url.pathname))return fail(404);
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(request.method))return fail(405);
    // Stripe signs the exact raw body; server-to-server callbacks have no browser Origin.
    // This exception is limited to the organization-scoped signed webhook endpoint.
    const webhook=request.method==='POST' && /^\/api\/payments\/webhook\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname) && !!request.headers.get('stripe-signature');
    if(!webhook&&!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==webOrigin)return fail(403);
    const headers=new Headers();
    for(const key of requestHeaders)if(request.headers.has(key))headers.set(key,request.headers.get(key));
    if(webhook){
      headers.set('stripe-signature',request.headers.get('stripe-signature'));
      headers.set('origin',webOrigin);
      headers.delete('cookie');headers.delete('x-csrf-token');headers.delete('referer');
    }
    if(request.method==='POST'&&url.pathname==='/api/guest/staff/upload') {
      for(const key of ['x-growthcast-document-id','x-growthcast-document-title'])if(request.headers.has(key))headers.set(key,request.headers.get(key));
    }
    headers.set('x-growthcast-origin',originSecret);
    headers.set('x-forwarded-host',web.host);headers.set('x-forwarded-proto','https');
    // Never forward client-provided service credentials or forwarding metadata.
    let body;
    if(request.body){
      const reader=request.body.getReader();const chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBody){await reader.cancel();return fail(413);}chunks.push(value);}
      body=Buffer.concat(chunks);
    }
    try {
      const upstream=await fetchImpl(apiOrigin+url.pathname+url.search,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(25000)])});
      // Load balancers return HTML while a service is restarting. Auth clients expect JSON.
      if(upstream.status>=500 && /text\/html/i.test(upstream.headers.get('content-type')??'')) {
        await upstream.body?.cancel();return fail(upstream.status);
      }
      const out=new Headers({'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'});
      for(const key of responseHeaders)if(upstream.headers.has(key))out.set(key,upstream.headers.get(key));
      for(const cookie of upstream.headers.getSetCookie()){
        if(/;\s*domain=/i.test(cookie))return fail(502); // Host-only account cookies.
        out.append('set-cookie',cookie);
      }
      const location=upstream.headers.get('location');
      if(location){const destination=new URL(location,webOrigin);if(destination.origin!==webOrigin)return fail(502);out.set('location',destination.href);}
      return new Response(upstream.body,{status:upstream.status,headers:out});
    } catch {return fail(502);}
  };
}
