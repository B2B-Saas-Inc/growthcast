// Server-only transport. The private provider origin and credential are never
// accepted from staff requests or forwarded across redirects.
export function managedProviderApi({origin,token,fetchImpl=fetch}){
 if(origin!=='http://documenso.signing.staging.growthcast.internal:3000'||!/^api_[a-f0-9]{48}$/.test(token)||typeof fetchImpl!=='function')throw Error('Private staging provider configuration required');
 return async(path,options={})=>{
  try{
   if(typeof path!=='string'||!/^\/envelope(?:\/[A-Za-z0-9_-]+)*$/.test(path)||!['GET','POST'].includes(options.method??'GET')||Object.keys(options).some(k=>!['method','headers','body'].includes(k)))throw Error();
   const headers=new Headers(options.headers);
   if([...headers.keys()].some(k=>k!=='content-type'))throw Error();
   headers.set('Authorization','Bearer '+token);
   const response=await fetchImpl(origin+'/api/v2'+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok){await response.body?.cancel();throw Error();}
   return response;
  }catch{throw Error('Private signing provider request unavailable');}
 };
}
