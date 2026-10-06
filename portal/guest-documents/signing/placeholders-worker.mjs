import {workerData,parentPort} from 'node:worker_threads';
import {detectPlaceholders} from './placeholders-core.mjs';
try{parentPort.postMessage(await detectPlaceholders(workerData));}catch{parentPort.postMessage(null);}
