import {fieldMetadata} from './field-meta.mjs';
import {createHash} from 'node:crypto';
const fail=()=>{throw Error('Invalid signing fields');};
const types=new Set(['SIGNATURE','INITIALS','NAME','EMAIL','DATE','TEXT','NUMBER','CHECKBOX']);
const keys=['height','label','page','positionX','positionY','required','type','width'];
// Coordinates are percentages of the displayed PDF page, matching Documenso.
// Callers must obtain pageCount from the stored PDF, not an HTTP request.
export function signingFields(input,pageCount){
 if(!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>1000||!Array.isArray(input)||input.length<1||input.length>100)fail();
 const fields=input.map(f=>{
  if(!f||typeof f!=='object'||Object.keys(f).sort().join()!==[...keys,...(f.meta!==undefined?['meta']:[])].sort().join()||!types.has(f.type)||typeof f.required!=='boolean'||typeof f.label!=='string'||!f.label.trim()||f.label.length>120||/[\x00-\x1f]/.test(f.label))fail();
  if(!Number.isSafeInteger(f.page)||f.page<1||f.page>pageCount)fail();
  for(const k of ['positionX','positionY','width','height'])if(typeof f[k]!=='number'||!Number.isFinite(f[k])||f[k]<0||f[k]>100||Math.abs(f[k]*100-Math.round(f[k]*100))>1e-8)fail();
  if(f.width<1||f.height<1||f.positionX+f.width>100||f.positionY+f.height>100)fail();
  if(['SIGNATURE','INITIALS'].includes(f.type)&&!f.required)fail();
  return {...Object.fromEntries(keys.map(k=>[k,f[k]])),...(f.meta!==undefined?{meta:fieldMetadata(f.type,f.meta)}:{})};
 });
 if(!fields.some(f=>f.type==='SIGNATURE'))fail();
 return fields;
}
export const fieldsHash=fields=>createHash('sha256').update(JSON.stringify(fields)).digest('hex');
export function providerFields(fields){
 return fields.map(({label,required,meta,...f})=>({...f,identifier:0,fieldMeta:{type:f.type.toLowerCase(),label,required,...meta,
  ...(f.type==='CHECKBOX'?{values:[{id:0,checked:false,value:label}],validationRule:required?'Select exactly':'',validationLength:required?1:0}:{})}}));
}
