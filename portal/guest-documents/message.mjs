// Immutable review template only. This module does not generate access secrets or send mail.
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shell=body=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head><body style="margin:0;background:#f4f1e9;color:#242426;font-family:Manrope,Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:16px auto;padding:24px;background:#faf8f2;border:1px solid #d8d2c5;border-top:3px solid #ff6b4a;overflow-wrap:anywhere"><p style="font-size:30px;font-weight:700;letter-spacing:-1.4px;margin:0 0 24px">GrowthCast</p>${body}<hr style="border:0;border-top:1px solid #d8d2c5;margin:28px 0 16px"><p style="font-family:'DM Mono','Courier New',monospace;font-size:11px;color:#716d64">GROWTHCAST · CLIENT PORTAL</p></main></body></html>`;
export function messagePreview({title,version,recipient_email,requirePin=true}) {
 if(typeof requirePin!=='boolean')throw Error('Invalid PIN policy');
 const subject=`GrowthCast document: ${title}`;
 const pinSubject='Your GrowthCast document access code';
 const introduction=`GrowthCast has shared “${title}” (version ${version}) with you.`;
 const instruction=requirePin?'Open the secure document link and enter the eight-digit code from our separate email. You do not need a portal account.':'Open the secure document link to review and sign. No PIN or portal account is required. Keep this link private.';
 const pinInstruction='Enter this code on the document page opened from our separate email. Do not forward this code.';
 return {
  revision:requirePin?'gc-guest-mail-v1':'gc-guest-mail-link-v1',from:'GrowthCast <clients@growthcast.app>',replyTo:'clients@growthcast.app',to:recipient_email,
  policy:requirePin?{pinDelivery:'separate-email-same-recipient',pinDigits:8,accountRequired:false,linkPlaceholder:'[Secure document link]',pinPlaceholder:'[Eight-digit access code]'}:{pinDelivery:'none',accountRequired:false,linkPlaceholder:'[Secure document link]'},
  document:{subject,text:`${introduction}\n\n${instruction}\n\n[Secure document link]\n\nGrowthCast · Client portal`,html:shell(`<h1 style="font-size:24px">A document is ready for review</h1><p>${escape(introduction)}</p><p>${escape(instruction)}</p><p style="display:inline-block;background:#242426;color:#fff;padding:12px 20px">[Secure document link]</p>`)},
  pin:requirePin?{subject:pinSubject,text:`${pinInstruction}\n\n[Eight-digit access code]\n\nGrowthCast · Client portal`,html:shell(`<h1 style="font-size:24px">Your document access code</h1><p>${escape(pinInstruction)}</p><p style="font-family:'DM Mono','Courier New',monospace;font-size:20px">[Eight-digit access code]</p>`)}:null
 };
}
