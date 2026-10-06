import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// Same final-revision CMS verification used by the existing signing harness.
// The trust bundle is server configuration, never an uploaded certificate.
export function sealedPdfVerifier(trustPath){
 if(typeof trustPath!=='string'||!trustPath.startsWith('/'))throw Error('Signing trust bundle required');
 return async bytes=>{
  if(!Buffer.isBuffer(bytes)||bytes.length>16*1024*1024)return false;
  const ranges=[...bytes.toString('latin1').matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if(!ranges.length)return false;const [start,length,offset,remaining]=ranges.at(-1).slice(1).map(Number);
  if(![start,length,offset,remaining].every(Number.isSafeInteger)||start!==0||length<1||offset<=length||offset+remaining!==bytes.length)return false;
  const gap=bytes.subarray(length,offset).toString('ascii');if(!/^<[0-9a-fA-F\s]+>$/.test(gap))return false;
  const directory=await mkdtemp(join(tmpdir(),'gc-signature-'));
  try{
   await writeFile(join(directory,'signature.der'),Buffer.from(gap.slice(1,-1).replace(/\s/g,''),'hex'),{mode:0o600});
   await writeFile(join(directory,'content.bin'),Buffer.concat([bytes.subarray(0,length),bytes.subarray(offset)]),{mode:0o600});
   await promisify(execFile)('openssl',['cms','-verify','-binary','-inform','DER','-in',join(directory,'signature.der'),'-content',join(directory,'content.bin'),'-CAfile',trustPath,'-purpose','any','-out','/dev/null'],{timeout:15000,maxBuffer:4096});return true;
  }catch{return false;}finally{await rm(directory,{recursive:true,force:true});}
 };
}
