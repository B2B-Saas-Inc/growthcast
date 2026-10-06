import {workerData,parentPort} from 'node:worker_threads';
import {PDFDocument} from 'pdf-lib';
try{const pdf=await PDFDocument.load(workerData,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});parentPort.postMessage(pdf.getPageCount());}catch{parentPort.postMessage(null);}
