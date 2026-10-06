import {Worker} from 'node:worker_threads';
let active=0;
export function sourcePdf(bytes,mode='proof'){
 if(active>=2||!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>3*1024*1024||!['proof','hash'].includes(mode))throw Error('Source PDF unavailable');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./source-pdf-worker.mjs',import.meta.url),{workerData:{bytes,mode},stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}});active++;worker.stdout.resume();worker.stderr.resume();let done=false;
  const finish=result=>{if(done)return;done=true;active--;clearTimeout(timer);void worker.terminate();result?resolve(result):reject(Error('Source PDF unavailable'));};
  const timer=setTimeout(()=>finish(null),15000);worker.once('message',finish);worker.once('error',()=>finish(null));worker.once('exit',()=>finish(null));
 });
}
