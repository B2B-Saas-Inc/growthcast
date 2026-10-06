import {parentPort,workerData} from 'node:worker_threads';
import {sourcePdfProof,pdfObjectHash} from './source-pdf-core.mjs';
try{const bytes=Buffer.from(workerData.bytes);parentPort.postMessage(workerData.mode==='hash'?await pdfObjectHash(bytes):await sourcePdfProof(bytes));}catch{parentPort.postMessage(null);}
