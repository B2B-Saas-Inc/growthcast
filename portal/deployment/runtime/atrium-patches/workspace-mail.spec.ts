import {describe,it,expect,mock,beforeEach} from 'bun:test';
const transports:any[]=[],messages:any[]=[];
let fail=false;
mock.module('nodemailer',()=>({createTransport:(options:any)=>{transports.push(options);return {sendMail:async(message:any)=>{if(fail)throw new Error('SMTP unavailable');messages.push(message)},close:()=>{}}}}));
const {sendWorkspaceMail}=await import('./workspace-mail');
const {createCapturedMail}=await import('./mail/capture-mail');
const good={provider:'smtp',isOrgConfigured:true,from:'clients@growthcast.app',smtp:{host:'smtp.gmail.com',port:465,secure:true,user:'ewhite@growthcast.app',pass:'synthetic-app-password'}};
const config=(values:Record<string,string>)=>({get:(key:string)=>values[key]}) as any;
const settings=(value:any)=>({getEffectiveEmailConfig:async(id:string)=>{expect(id).toBe('sender-org');return value}}) as any;
beforeEach(()=>{transports.length=0;messages.length=0;fail=false});
describe('Workspace mail delivery',()=>{
 it('resolves the platform sender without recipient organization membership',async()=>{expect(await sendWorkspaceMail(settings(good),config({PORTAL_MAIL_ORGANIZATION_ID:'sender-org'}),'recipient@example.com','Verification','body')).toEqual({sent:true,viaOrgConfig:true});expect(messages[0].from).toBe('clients@growthcast.app');expect(transports[0].secure).toBe(true);expect(transports[0].tls.rejectUnauthorized).toBe(true);expect(transports[0].connectionTimeout).toBe(5000)});
 it('refuses missing platform sender identity',async()=>{await expect(sendWorkspaceMail(settings(good),config({}),'recipient@example.com','Subject','body')).rejects.toThrow('organization');expect(messages.length).toBe(0)});
 it('refuses sender, host, login and TLS misconfiguration',async()=>{for(const value of [{...good,from:'other@example.com'},{...good,smtp:{...good.smtp,host:'localhost'}},{...good,smtp:{...good.smtp,user:'other@example.com'}},{...good,smtp:{...good.smtp,secure:false}}]){await expect(sendWorkspaceMail(settings(value),config({PORTAL_MAIL_ORGANIZATION_ID:'sender-org'}),'recipient@example.com','Subject','body')).rejects.toThrow('incomplete')}expect(messages.length).toBe(0)});
 it('propagates delivery failure instead of reporting success or changing providers',async()=>{fail=true;await expect(sendWorkspaceMail(settings(good),config({PORTAL_MAIL_ORGANIZATION_ID:'sender-org'}),'recipient@example.com','Subject','body')).rejects.toThrow('SMTP unavailable')});
 it('keeps synthetic recipients captured in Workspace mode',async()=>{const capture=createCapturedMail(config({PORTAL_MAIL_MODE:'workspace-smtp',PORTAL_MAIL_CAPTURE_HOST:'127.0.0.1'}))!;await capture('synthetic@growthcast.invalid','Subject','body');expect(transports[0].port).toBe(1025);expect(messages[0].from).toBe('portal@growthcast.invalid');expect(await capture('recipient@example.com','Subject','body')).toBeNull();expect(messages.length).toBe(1)});
 it('keeps capture-only mode closed to real recipients',async()=>{const capture=createCapturedMail(config({PORTAL_MAIL_MODE:'capture'}))!;await expect(capture('recipient@example.com','Subject','body')).rejects.toThrow('Staging recipient denied');expect(messages.length).toBe(0)});
});
