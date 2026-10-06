import {fieldMetadata} from './field-meta.mjs';
import {PDF} from '@libpdf/core';
const supported=new Set(['SIGNATURE','INITIALS','NAME','EMAIL','DATE','TEXT','NUMBER','CHECKBOX']);
const round=x=>Math.round(x*100)/100;
export async function detectPlaceholders(bytes){
 const pdf=await PDF.load(bytes);if(pdf.isEncrypted)throw Error('Encrypted PDF unavailable');
 if(pdf.getPages().length>1000)throw Error('Too many pages');
 const fields=[],warnings=[];
 for(const page of pdf.getPages())for(const match of page.findText(/\{\{([^}]+)\}\}/g)){
  if(fields.length+warnings.length>=100)throw Error('Too many document placeholders');
  const [rawType,recipient,...options]=match.text.slice(2,-2).split(',').map(x=>x.trim()),type=rawType.toUpperCase();
  if(!supported.has(type)||!/^r1$/i.test(recipient??'')){warnings.push(`Page ${page.index+1}: ${match.text} needs review. Use a supported field type and r1 for the selected recipient.`);continue;}
  const parsed=Object.create(null);let invalid=false;
  for(const option of options){const equals=option.indexOf('=');const key=option.slice(0,equals),value=option.slice(equals+1);if(equals<1||Object.hasOwn(parsed,key)||(key==='required'&&!['true','false'].includes(value))){invalid=true;break;}parsed[key]=value;}
  let meta={};try{const raw={...parsed};delete raw.label;delete raw.required;for(const key of Object.keys(raw)){if(key==='readOnly'){if(!['true','false'].includes(raw[key]))throw Error();raw[key]=raw[key]==='true';}else if(['fontSize','characterLimit','minValue','maxValue'].includes(key))raw[key]=Number(raw[key]);}meta=fieldMetadata(type,raw);}catch{invalid=true;}
  if(invalid){warnings.push(`Page ${page.index+1}: ${match.text} has unsupported or invalid field options. Check the source document before approval.`);continue;}
  const label=parsed.label||type[0]+type.slice(1).toLowerCase();
  if(label.length>120||/[\x00-\x1f]/.test(label)){warnings.push(`Page ${page.index+1}: field label is invalid.`);continue;}
  const x=round(Math.max(0,match.bbox.x/page.width*100)),y=round(Math.max(0,(page.height-match.bbox.y-match.bbox.height)/page.height*100));
  const width=round(Math.min(100-x,Math.max(1,match.bbox.width/page.width*100))),height=round(Math.min(100-y,Math.max(1,match.bbox.height/page.height*100)));
  if(width<1||height<1){warnings.push(`Page ${page.index+1}: placeholder is outside the page.`);continue;}
  fields.push({type,label,required:['SIGNATURE','INITIALS'].includes(type)||parsed.required!=='false',page:page.index+1,positionX:x,positionY:y,width,height,...(Object.keys(meta).length?{meta}:{})});
 }
 return {fields,warnings};
}
