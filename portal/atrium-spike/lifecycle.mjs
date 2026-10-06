import { reconcileCompletion } from './completion.mjs';

// Trusted provisioning only. Duplicate deliveries cannot replace scope/proof.
export async function enqueueCompletion(pool,{grantId,documentId,teamId,verifiedSha256}) {
  await pool.query(`INSERT INTO lifecycle_jobs(grant_id,document_id,team_id,verified_sha256)
    VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[grantId,documentId,teamId,verifiedSha256]);
  const {rows}=await pool.query('SELECT document_id,team_id,verified_sha256 FROM lifecycle_jobs WHERE grant_id=$1',[grantId]);
  const row=rows[0];
  if(row.document_id!==documentId||row.team_id!==teamId||row.verified_sha256!==verifiedSha256)throw Error('Approved reconciliation job is immutable');
}

// One bounded polling iteration. A stopped process leaves a reclaimable lease;
// another process may resume without filesystem state or provider write retries.
export async function runReconciliation(pool,resolveApi) {
  const {rows}=await pool.query('SELECT public.lifecycle_claim() AS job');
  const job=rows[0].job;
  if(!job)return {state:'idle'};
  try {
    const api=await resolveApi({teamId:job.team_id,organizationId:job.binding.organizationId});
    const artifact=await reconcileCompletion({store:{pool},documentId:job.document_id,grantId:job.grant_id,
      approved:job.binding,teamId:job.team_id,api,verifiedSha256:job.verified_sha256,leaseToken:job.lease_token});
    return {state:'done',artifact};
  } catch {
    // Persist only a bounded category, never provider errors/tokens/document data.
    const retried=await pool.query('SELECT public.lifecycle_retry($1,$2) AS retried',[job.grant_id,job.lease_token]);
    return {state:retried.rows[0].retried?'retry':'lease-lost'};
  }
}
