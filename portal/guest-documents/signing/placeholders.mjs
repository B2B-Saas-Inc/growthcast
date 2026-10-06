import {Worker} from 'node:worker_threads';
let active=0;
export function pdfPlaceholders(bytes){
 if(active>=2)throw Error('PDF parser busy');
 if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>3*1024*1024)throw Error('PDF unavailable');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./placeholders-worker.mjs',import.meta.url),{workerData:bytes,stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}});active++;worker.stdout.resume();worker.stderr.resume();
  let settled=false;const done=result=>{if(settled)return;settled=true;active--;clearTimeout(timer);void worker.terminate();if(result&&Array.isArray(result.fields)&&Array.isArray(result.warnings))resolve(result);else reject(Error('Document placeholders unavailable'));};
  const timer=setTimeout(()=>done(null),15000);worker.once('message',done);worker.once('error',()=>done(null));worker.once('exit',()=>done(null));
 });
}
