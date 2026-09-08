import {createHttpHandler} from '../payments/http.mjs';
import {createRuntime} from '../payments/runtime.mjs';
export const config={api:{bodyParser:false},maxDuration:60};
let runtime;
const getRuntime=()=>runtime??=(createRuntime().catch(error=>{runtime=undefined;throw error;}));
export default createHttpHandler({getRuntime});
