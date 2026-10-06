const common=['readOnly','fontSize','textAlign','placeholder'];
const allowed={SIGNATURE:[],INITIALS:common,NAME:common,EMAIL:common,DATE:common,TEXT:[...common,'text','characterLimit'],NUMBER:[...common,'value','minValue','maxValue','numberFormat'],CHECKBOX:['readOnly']};
export function fieldMetadata(type,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!allowed[type])throw Error('Invalid field options');
 const result={};for(const key of Object.keys(input).sort()){
  const value=input[key];if(!allowed[type].includes(key))throw Error('Unsupported field option');
  if(key==='readOnly'){if(typeof value!=='boolean')throw Error('Invalid field option');}
  else if(['fontSize','characterLimit','minValue','maxValue'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12||key==='fontSize'&&(value<8||value>96)||key==='characterLimit'&&(!Number.isSafeInteger(value)||value<0||value>10000))throw Error('Invalid field option');}
  else if(typeof value!=='string'||value.length>10000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)||key==='textAlign'&&!['left','center','right'].includes(value))throw Error('Invalid field option');
  result[key]=value;
 }
 if(result.minValue!==undefined&&result.maxValue!==undefined&&result.minValue>result.maxValue)throw Error('Invalid numeric range');
 return result;
}
