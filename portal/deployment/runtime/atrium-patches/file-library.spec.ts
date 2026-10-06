import {describe,it,expect} from 'bun:test';
import {needsDocumentAction} from './upload-mode';
import {validateLibraryFile,LIBRARY_MAX_BYTES,FileLibraryService} from './file-library';
import {DocumentsService} from './documents/documents.service';

describe('upload-only contracts',()=>{
 it('does not invent an approval or signature requirement',()=>{
  expect(needsDocumentAction({})).toBe(false);expect(needsDocumentAction({options:'  '})).toBe(false);
  for(const action of [{requiresSignature:true},{requiresApproval:true},{options:'Yes,No'}])expect(needsDocumentAction(action)).toBe(true);
 });
 it('persists uploaded without reminders or client notifications',async()=>{
  let created:any;let notified=false;
  const service=new DocumentsService({project:{findFirst:async()=>({id:'p'})},document:{create:async({data}:any)=>(created={id:'d',...data})}} as any,{} as any,{} as any,{notifyDocumentUploaded:()=>{notified=true;}} as any,{} as any,{log:()=>{}} as any);
  await service.create({projectId:'p',type:'contract',title:'Already executed',reminderEnabled:true},'f','o','u');
  expect(created.status).toBe('uploaded');expect(created.reminderEnabled).toBe(false);expect(notified).toBe(false);
  await service.create({projectId:'p',type:'contract',title:'Needs signature',requiresSignature:true},'f','o','u');expect(created.status).toBe('draft');
 });
 it('rejects sending a legacy no-action draft without notifying anyone',async()=>{
  const service=new DocumentsService({document:{findFirst:async()=>({id:'d',status:'draft',requiresSignature:false,requiresApproval:false,signatureFields:[]})}} as any,{} as any,{} as any,{notifyDocumentUploaded:()=>{throw Error('must not notify');}} as any,{} as any,{} as any);
  await expect(service.send('d','o','u')).rejects.toThrow('needs no client action');
 });
});
describe('Library uploads',()=>{
 it('accepts requested formats, including HTML, without executing them',()=>{
  for(const ext of ['doc','docx','xls','xlsx','md','csv','html','htm','pdf'])expect(validateLibraryFile({originalname:'SOP.'+ext,buffer:Buffer.from('x'),size:1,mimetype:'application/octet-stream'})).toBe('SOP.'+ext);
 });
 it('rejects executable, oversized, empty and mismatched uploads',()=>{
  for(const file of [{originalname:'sop.exe',buffer:Buffer.from('x'),size:1},{originalname:'sop.md',buffer:Buffer.alloc(0),size:0},{originalname:'sop.md',buffer:Buffer.from('x'),size:2},{originalname:'sop.md',buffer:Buffer.alloc(LIBRARY_MAX_BYTES+1),size:LIBRARY_MAX_BYTES+1}])expect(()=>validateLibraryFile({...file,mimetype:'text/plain'})).toThrow();
 });
 it('denies a foreign original before any storage lookup',async()=>{
  const service=new FileLibraryService({$queryRaw:async()=>[]} as any,{download:async()=>{throw Error('must not read storage');}} as any,{} as any);
  await expect(service.download('foreign','o')).rejects.toThrow('Library file not found');
 });
});
