import {Worker} from 'node:worker_threads';
export function countPdfPages(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>3*1024*1024)throw Error('PDF unavailable');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./pdf-worker.mjs',import.meta.url),{workerData:bytes,stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16}});
  worker.stdout.resume();worker.stderr.resume();
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);void worker.terminate();if(Number.isSafeInteger(value)&&value>0&&value<=1000)resolve(value);else reject(Error('PDF pages unavailable'));};
  const timeout=setTimeout(()=>finish(null),10000);
  worker.once('message',finish);worker.once('error',()=>finish(null));worker.once('exit',()=>finish(null));
 });
}
