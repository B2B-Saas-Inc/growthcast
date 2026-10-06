import {createHash} from 'node:crypto';
import {PDF,rgb} from '@libpdf/core';
import {PDFDocument} from 'pdf-lib';
import {detectPlaceholders} from './placeholders-core.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
// Bind every parsed indirect object plus root/info/encryption references.
// File identifiers and physical cross-reference serialization are not document
// content; content streams, metadata, object numbers and references remain bound.
export async function pdfObjectHash(bytes){
 const pdf=await PDFDocument.load(bytes,{updateMetadata:false}),context=pdf.context;
 const objectBytes=obj=>{if(!obj)return null;const b=new Uint8Array(obj.sizeInBytes());obj.copyBytesInto(b,0);return hash(b);};
 return hash(JSON.stringify({trailer:['Root','Info','Encrypt'].map(k=>[k,objectBytes(context.trailerInfo[k])]),objects:context.enumerateIndirectObjects().map(([ref,obj])=>[ref.toString(),objectBytes(obj)])}));
}
export async function sourcePdfProof(bytes){
 const tags=await detectPlaceholders(bytes);if(tags.warnings.length)throw Error('Unsupported document tags');
 if(!tags.fields.length)return {tagged:false};
 const pdf=await PDF.load(bytes);
 for(const page of pdf.getPages())for(const match of page.findText(/\{\{([^}]+)\}\}/g))page.drawRectangle({...match.bbox,color:rgb(1,1,1),borderColor:rgb(1,1,1),borderWidth:2});
 return {tagged:true,objectHash:await pdfObjectHash(Buffer.from(await pdf.save())),tagCount:tags.fields.length};
}
