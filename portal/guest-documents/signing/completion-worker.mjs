export function completionQueue({pool,completion,secrets}){
 if(!pool?.query||typeof completion?.reconcile!=='function'||typeof secrets?.open!=='function')throw Error('Lifecycle worker dependencies required');
 let cursor=null;
 return {async runOnce(){
  const {rows}=await pool.query('SELECT * FROM gc_atrium.guest_pending_completions($1)',[cursor]);
  if(!rows.length){cursor=null;return {checked:0,completed:0,failed:0};}
  let completed=0,failed=0;
  for(const row of rows){
   try{const result=await completion.reconcile({sendId:row.id,binding:secrets.open(row.id,row.binding_ciphertext)});if(result?.documentId)completed++;}
   catch{failed++;}
   cursor=row.id;
  }
  return {checked:rows.length,completed,failed};
 }};
}
