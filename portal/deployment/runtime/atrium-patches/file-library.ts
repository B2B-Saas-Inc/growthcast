import {CanActivate, ExecutionContext, BadRequestException, Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, PayloadTooLargeException, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors} from "@nestjs/common";
import {FileInterceptor} from "@nestjs/platform-express";
import {IsString, IsNotEmpty, MaxLength} from "class-validator";
import {randomUUID, createHash} from "crypto";
import {extname} from "path";
import type {Response} from "express";
import {PrismaService} from "./prisma/prisma.service";
import {FilesModule} from "./files/files.module";
import {STORAGE_PROVIDER, type StorageProvider} from "./files/storage/storage.interface";
import type {UploadedFile as FileInput} from "./files/files.service";
import {SettingsService} from "./settings/settings.service";
import {SettingsModule} from "./settings/settings.module";
import {AuthGuard, RolesGuard, Roles, CurrentOrg, CurrentUser, PaginationQueryDto, contentDisposition, sanitizeFilename} from "./common";

export const LIBRARY_MAX_BYTES = 2 * 1024 * 1024;
const extensions = new Set(['.pdf','.doc','.docx','.xls','.xlsx','.csv','.md','.txt','.html','.htm','.ppt','.pptx','.rtf','.odt','.ods','.jpg','.jpeg','.png','.webp']);
export function validateLibraryFile(file: FileInput) {
 if (!file?.buffer?.length || file.size !== file.buffer.length) throw new BadRequestException('Choose a non-empty file');
 if (file.size > LIBRARY_MAX_BYTES) throw new PayloadTooLargeException('Files must be 2 MB or smaller');
 if (!extensions.has(extname(file.originalname).toLowerCase())) throw new BadRequestException('This file type is not supported in the Library');
 return sanitizeFilename(file.originalname);
}
type Entry = {id:string; organizationId:string; filename:string; storageKey:string; mimeType:string; sizeBytes:number; sha256:string; createdAt:Date; archivedAt:Date|null};
class ShareDto { @IsString() @IsNotEmpty() @MaxLength(128) projectId!:string; }
@Injectable()
export class FileLibraryService {
 constructor(private prisma:PrismaService, @Inject(STORAGE_PROVIDER) private storage:StorageProvider, private settings:SettingsService) {}
 async list(org:string,page=1,limit=20) {
  const [data,counts] = await Promise.all([
   this.prisma.$queryRaw<Array<Pick<Entry,'id'|'filename'|'mimeType'|'sizeBytes'|'createdAt'>>>`SELECT id,filename,"mimeType","sizeBytes","createdAt" FROM gc_atrium.library_file WHERE "organizationId"=${org} AND "archivedAt" IS NULL ORDER BY "createdAt" DESC,id LIMIT ${limit} OFFSET ${(page-1)*limit}`,
   this.prisma.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM gc_atrium.library_file WHERE "organizationId"=${org} AND "archivedAt" IS NULL`
  ]);
  const total=Number(counts[0].count);return {data,meta:{page,limit,total,totalPages:Math.ceil(total/limit)}};
 }
 async upload(file:FileInput,org:string,user:string) {
  const filename=validateLibraryFile(file);
  if (file.size > (await this.settings.getEffectiveMaxFileSize(org))*1024*1024) throw new PayloadTooLargeException('File exceeds the workspace size limit');
  const id=randomUUID(),key=`${org}/library/${id}-${filename}`,hash=createHash('sha256').update(file.buffer).digest('hex');
  // Originals and project copies are download-only, including HTML.
  const mime='application/octet-stream';
  await this.storage.upload(key,file.buffer,mime);
  try {
   await this.prisma.$executeRaw`INSERT INTO gc_atrium.library_file (id,"organizationId",filename,"storageKey","mimeType","sizeBytes",sha256,"uploadedById") VALUES (${id},${org},${filename},${key},${mime},${file.size},${hash},${user})`;
  } catch (error) {
   // A lost commit acknowledgement is not proof that the insert failed.
   try {const rows=await this.prisma.$queryRaw<{id:string}[]>`SELECT id FROM gc_atrium.library_file WHERE id=${id}`;if(!rows.length)await this.storage.delete(key);} catch {}
   throw error;
  }
  return {id,filename,sizeBytes:file.size};
 }
 private async entry(id:string,org:string) {
  const rows=await this.prisma.$queryRaw<Entry[]>`SELECT * FROM gc_atrium.library_file WHERE id=${id} AND "organizationId"=${org} AND "archivedAt" IS NULL`;
  if(!rows[0])throw new NotFoundException('Library file not found');return rows[0];
 }
 private async bytes(entry:Entry) {
  const {body}=await this.storage.download(entry.storageKey);const chunks:Buffer[]=[];let size=0;
  try {for await (const chunk of body) {const b=Buffer.from(chunk);size+=b.length;if(size>LIBRARY_MAX_BYTES)throw new BadRequestException('File exceeds its stored size');chunks.push(b);}} finally {body.destroy();}
  const bytes=Buffer.concat(chunks);
  if(size!==entry.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new BadRequestException('File integrity check failed');return bytes;
 }
 async download(id:string,org:string) {const entry=await this.entry(id,org);const bytes=await this.bytes(entry);await this.entry(id,org);return {bytes,filename:entry.filename};}
 async archive(id:string,org:string) {
  const count=await this.prisma.$executeRaw`UPDATE gc_atrium.library_file SET "archivedAt"=now() WHERE id=${id} AND "organizationId"=${org} AND "archivedAt" IS NULL`;
  if(!count)throw new NotFoundException('Library file not found');return {archived:true};
 }
 async share(id:string,projectId:string,org:string,user:string) {
  const entry=await this.entry(id,org);
  if(!await this.prisma.project.findFirst({where:{id:projectId,organizationId:org,archivedAt:null},select:{id:true}}))throw new NotFoundException('Project not found');
  const bytes=await this.bytes(entry),key=`${org}/${projectId}/${randomUUID()}-${entry.filename}`;
  await this.storage.upload(key,bytes,'application/octet-stream');
  let used=false;
  try {
   const result=await this.prisma.$transaction(async tx=>{
    // Serialize retries and archive/share operations on this original.
    const current=await tx.$queryRaw<Entry[]>`SELECT * FROM gc_atrium.library_file WHERE id=${id} AND "organizationId"=${org} AND "archivedAt" IS NULL FOR UPDATE`;
    if(!current.length)throw new NotFoundException('Library file not found');
    const projects=await tx.$queryRaw<{id:string}[]>`SELECT id FROM gc_atrium.project WHERE id=${projectId} AND "organizationId"=${org} AND "archivedAt" IS NULL FOR UPDATE`;
    if(!projects.length)throw new NotFoundException('Project not found');
    const previous=await tx.$queryRaw<{fileId:string}[]>`SELECT "fileId" FROM gc_atrium.library_share WHERE "libraryId"=${id} AND "projectId"=${projectId}`;
    if(previous.length)return {id:previous[0].fileId,alreadyAdded:true};
    const file=await tx.file.create({data:{filename:entry.filename,storageKey:key,mimeType:'application/octet-stream',sizeBytes:entry.sizeBytes,projectId,organizationId:org,uploadedById:user}});
    await tx.$executeRaw`INSERT INTO gc_atrium.library_share ("libraryId","projectId","fileId") VALUES (${id},${projectId},${file.id})`;
    return {id:file.id,alreadyAdded:false};
   });
   used=!result.alreadyAdded;return result;
  } finally {if(!used){try {const referenced=await this.prisma.file.findFirst({where:{storageKey:key},select:{id:true}});if(!referenced)await this.storage.delete(key);} catch { /* Retain on an uncertain database outcome. */ }}}
 }
}
@Injectable()
export class LibraryStaffGuard implements CanActivate {
 constructor(private prisma:PrismaService) {}
 async canActivate(context:ExecutionContext) {
  const req=context.switchToHttp().getRequest();
  if(!req.user?.id||!req.session?.id||!req.organization?.id)return false;
  const rows=await this.prisma.$queryRaw<{id:string}[]>`SELECT m.id FROM gc_atrium.member m JOIN gc_atrium."user" u ON u.id=m."userId" JOIN gc_atrium."session" s ON s."userId"=u.id WHERE m."userId"=${req.user.id} AND m."organizationId"=${req.organization.id} AND m.role IN ('owner','admin') AND u."emailVerified"=true AND s.id=${req.session.id} AND s."expiresAt">now() AND s."activeOrganizationId"=m."organizationId"`;
  return rows.length===1;
 }
}
@Controller('library')
@UseGuards(AuthGuard,LibraryStaffGuard)
@Roles('owner','admin')
export class FileLibraryController {
 constructor(private service:FileLibraryService) {}
 @Get() list(@CurrentOrg('id') org:string,@Query() pagination:PaginationQueryDto) {return this.service.list(org,pagination.page,pagination.limit);}
 @Post('upload')
 @UseInterceptors(FileInterceptor('file',{limits:{fileSize:LIBRARY_MAX_BYTES}}))
 upload(@UploadedFile() file:FileInput,@CurrentOrg('id') org:string,@CurrentUser('id') user:string) {return this.service.upload(file,org,user);}
 @Post(':id/share') share(@Param('id') id:string,@Body() dto:ShareDto,@CurrentOrg('id') org:string,@CurrentUser('id') user:string) {return this.service.share(id,dto.projectId,org,user);}
 @Post(':id/archive') archive(@Param('id') id:string,@CurrentOrg('id') org:string) {return this.service.archive(id,org);}
 @Get(':id/download') async download(@Param('id') id:string,@CurrentOrg('id') org:string,@Res() res:Response) {
  const file=await this.service.download(id,org);
  res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',contentDisposition(file.filename));
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");res.setHeader('Cache-Control','private, no-store');res.send(file.bytes);
 }
}
@Module({imports:[FilesModule,SettingsModule],controllers:[FileLibraryController],providers:[FileLibraryService,LibraryStaffGuard]})
export class FileLibraryModule {}
