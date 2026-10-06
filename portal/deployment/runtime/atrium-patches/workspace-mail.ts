import type {ConfigService} from '@nestjs/config';
import type {SettingsService} from './settings/settings.service';
import * as nodemailer from 'nodemailer';
export const SMTP_TIMEOUTS={connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000};
export async function sendWorkspaceMail(settings:SettingsService,config:ConfigService,to:string,subject:string,html:string){
 const org=config.get<string>('PORTAL_MAIL_ORGANIZATION_ID');
 if(!org)throw new Error('Workspace sender organization is not configured');
 const mail=await settings.getEffectiveEmailConfig(org);
 if(mail.provider!=='smtp'||!mail.isOrgConfigured||mail.from!=='clients@growthcast.app'||mail.smtp?.host!=='smtp.gmail.com'||mail.smtp.port!==465||mail.smtp.secure!==true||mail.smtp.user!=='ewhite@growthcast.app'||!mail.smtp.pass)throw new Error('GrowthCast Google Workspace SMTP settings are incomplete');
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to))throw new Error('Invalid email recipient');
 const transport=nodemailer.createTransport({host:mail.smtp.host,port:465,secure:true,auth:{user:mail.smtp.user,pass:mail.smtp.pass},...SMTP_TIMEOUTS,tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'}});
 try{await transport.sendMail({from:mail.from,to,subject,html});return {sent:true,viaOrgConfig:true}}finally{transport.close()}
}
