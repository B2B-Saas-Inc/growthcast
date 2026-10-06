// Synthetic, valid PDF fixtures. Never used by application runtime.
export function pdf(extra='',comment='',text='GrowthCast review document'){
 const content=`BT /F1 ${text.includes('{{')?9:18} Tf 50 720 Td (${text.replace(/[\\()]/g,'\\$&')}) Tj ET\n`;
 const objects=[`<< /Type /Catalog /Pages 2 0 R ${extra} >>`,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let s='%PDF-1.7\n%'+comment+'\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(s));s+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(s);s+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return Buffer.from(s);
}
