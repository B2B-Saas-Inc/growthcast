import {createRuntime} from './runtime.mjs';
import {recover} from './recovery.mjs';
const runtime=await createRuntime();
try{
 const result=await recover({...runtime,execute:process.argv.includes('--execute')});
 console.log(JSON.stringify(result));
 if(result.failed)process.exitCode=1;
}finally{await runtime.pool.end();}
