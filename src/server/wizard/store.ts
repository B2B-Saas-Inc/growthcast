// Postgres access for the Positioning Wizard. Every run query is scoped to the device and its current user.
import postgres from "postgres";
import { LIMITS } from "./config.js";
import { InputError, type ResearchBrief } from "./validate.js";

export type Sql = ReturnType<typeof postgres>;
let client: Sql | undefined;

export function database(url: string): Sql {
  if (client) return client;
  const host = new URL(url).hostname;
  client = postgres(url, {
    max: 3,
    prepare: false, // Supabase's transaction pooler does not support named prepared statements.
    connect_timeout: 10,
    idle_timeout: 20,
    ssl: ["localhost", "127.0.0.1", "[::1]", "postgres"].includes(host) || new URL(url).searchParams.get("sslmode") === "disable" ? false : "require",
  });
  return client;
}

export type UserRow = { id: string; email: string; first_name: string; generations_used: number };
export type DeviceRow = { id: string; user_id: string; generations_used: number };
export type RunRow = {
  id: string;
  user_id: string;
  device_id: string;
  product: string;
  feature: string;
  website: string;
  audience: string;
  research_brief: ResearchBrief | Record<string, never>;
  icp: { name: string; summary?: string } | null;
  created_at: Date;
};
export type EvidenceRow = {
  id: string;
  kind: "upload" | "url";
  name: string;
  url: string | null;
  url_type: string | null;
  note: string;
  mime: string | null;
  content: string | null;
  status: "pending" | "ready" | "failed";
  error: string | null;
  created_at: Date;
};
export type JobRow = {
  id: string;
  module: "research" | "jtbd" | "positioning" | "pmm" | "copy";
  status: "running" | "succeeded" | "failed";
  input: Record<string, unknown>;
  output: string | null;
  error: string | null;
  model: string | null;
  progress: JobProgress | null;
  started_at: Date;
  finished_at: Date | null;
};
/** Which stage a running job is in: `step` of `steps`, with a short label shown to the user. */
export type JobProgress = { step: number; steps: number; label: string };

export const remaining = (user: UserRow, device: DeviceRow) =>
  Math.max(0, Math.min(LIMITS.generations - user.generations_used, LIMITS.generations - device.generations_used));

export async function upsertUser(sql: Sql, email: string, firstName: string, consentText: string, consentVersion: string) {
  const [user] = await sql<UserRow[]>`
    insert into wizard.users (email, first_name, consent_text, consent_version)
    values (${email}, ${firstName}, ${consentText}, ${consentVersion})
    on conflict (email) do update set first_name = excluded.first_name, consent_text = excluded.consent_text,
      consent_version = excluded.consent_version, consented_at = now()
    returning id, email, first_name, generations_used`;
  return user;
}

/** Reuses this browser's device row (keeping its quota) and points it at the current user. */
export async function attachDevice(sql: Sql, deviceId: string | null, userId: string) {
  if (deviceId) {
    const [row] = await sql<DeviceRow[]>`
      update wizard.devices set user_id = ${userId}, last_seen_at = now() where id = ${deviceId}
      returning id, user_id, generations_used`;
    if (row) return row;
  }
  const [row] = await sql<DeviceRow[]>`insert into wizard.devices (user_id) values (${userId}) returning id, user_id, generations_used`;
  return row;
}

export async function context(sql: Sql, deviceId: string) {
  const [row] = await sql<(DeviceRow & { email: string; first_name: string; user_generations: number })[]>`
    select d.id, d.user_id, d.generations_used, u.email, u.first_name, u.generations_used as user_generations
    from wizard.devices d join wizard.users u on u.id = d.user_id where d.id = ${deviceId}`;
  if (!row) return null;
  return {
    device: { id: row.id, user_id: row.user_id, generations_used: row.generations_used } as DeviceRow,
    user: { id: row.user_id, email: row.email, first_name: row.first_name, generations_used: row.user_generations } as UserRow,
  };
}

export async function listRuns(sql: Sql, deviceId: string, userId: string) {
  return sql<(Pick<RunRow, "id" | "product" | "feature" | "created_at"> & { modules: string[] })[]>`
    select r.id, r.product, r.feature, r.created_at,
      coalesce(array_agg(distinct j.module) filter (where j.status = 'succeeded'), '{}') as modules
    from wizard.runs r left join wizard.jobs j on j.run_id = r.id
    where r.device_id = ${deviceId} and r.user_id = ${userId}
    group by r.id order by r.created_at desc limit 20`;
}

export async function createRun(
  sql: Sql,
  deviceId: string,
  userId: string,
  input: { product: string; feature: string; website: string; audience: string; competitors: string },
) {
  return sql.begin(async (tx) => {
    const [user] = await tx<UserRow[]>`select id, email, first_name, generations_used from wizard.users where id = ${userId} for update`;
    const [device] = await tx<DeviceRow[]>`select id, user_id, generations_used from wizard.devices where id = ${deviceId} for update`;
    if (!user || !device) throw new InputError("Your session expired. Sign up again.", 401);
    if (remaining(user, device) <= 0) throw new InputError(`You have used all ${LIMITS.generations} Positioning Wizard runs.`, 402);
    await tx`update wizard.users set generations_used = generations_used + 1 where id = ${userId}`;
    await tx`update wizard.devices set generations_used = generations_used + 1 where id = ${deviceId}`;
    const brief = { kinds: [], competitors: input.competitors, queries: "", audience: input.audience, depth: "standard" };
    const [run] = await tx<RunRow[]>`
      insert into wizard.runs (user_id, device_id, product, feature, website, audience, research_brief)
      values (${userId}, ${deviceId}, ${input.product}, ${input.feature}, ${input.website}, ${input.audience}, ${tx.json(brief)})
      returning *`;
    if (input.website) {
      await tx`insert into wizard.evidence (run_id, kind, name, url, url_type) values (${run.id}, 'url', ${input.website}, ${input.website}, 'Our own page')`;
    }
    return run;
  });
}

export async function getRun(sql: Sql, runId: string, deviceId: string, userId: string) {
  const [run] = await sql<RunRow[]>`select * from wizard.runs where id = ${runId} and device_id = ${deviceId} and user_id = ${userId}`;
  if (!run) throw new InputError("That run was not found.", 404);
  return run;
}

export async function listEvidence(sql: Sql, runId: string) {
  return sql<EvidenceRow[]>`
    select id, kind, name, url, url_type, note, mime, content, status, error, created_at
    from wizard.evidence where run_id = ${runId} order by created_at`;
}

export async function addEvidence(
  sql: Sql,
  runId: string,
  item: { kind: "upload" | "url"; name: string; url?: string | null; urlType?: string | null; note?: string; mime?: string | null; content?: string | null; status: "pending" | "ready" },
) {
  const counts = await sql<{ kind: string; n: number }[]>`select kind, count(*)::int as n from wizard.evidence where run_id = ${runId} group by kind`;
  const n = counts.find((c) => c.kind === item.kind)?.n ?? 0;
  if (item.kind === "upload" && n >= LIMITS.uploadsPerRun) throw new InputError(`A run can have up to ${LIMITS.uploadsPerRun} documents.`);
  if (item.kind === "url" && n >= LIMITS.urlsPerRun) throw new InputError(`A run can have up to ${LIMITS.urlsPerRun} links.`);
  await sql`
    insert into wizard.evidence (run_id, kind, name, url, url_type, note, mime, content, status)
    values (${runId}, ${item.kind}, ${item.name}, ${item.url ?? null}, ${item.urlType ?? null}, ${item.note ?? ""}, ${item.mime ?? null}, ${item.content ?? null}, ${item.status})`;
}

export async function setEvidence(sql: Sql, id: string, fields: { content?: string | null; status: "ready" | "failed"; error?: string | null }) {
  await sql`update wizard.evidence set content = ${fields.content ?? null}, status = ${fields.status}, error = ${fields.error ?? null} where id = ${id}`;
}

export async function deleteEvidence(sql: Sql, runId: string, id: string) {
  await sql`delete from wizard.evidence where id = ${id} and run_id = ${runId}`;
}

export async function updateRun(sql: Sql, runId: string, fields: { research_brief?: ResearchBrief; icp?: { name: string; summary: string } }) {
  if (fields.research_brief) await sql`update wizard.runs set research_brief = ${sql.json(fields.research_brief)}, updated_at = now() where id = ${runId}`;
  if (fields.icp) await sql`update wizard.runs set icp = ${sql.json(fields.icp)}, updated_at = now() where id = ${runId}`;
}

export async function listJobs(sql: Sql, runId: string) {
  await sql`
    update wizard.jobs set status = 'failed', error = 'The job stopped before finishing. Try again.', finished_at = now()
    where run_id = ${runId} and status = 'running' and started_at < now() - ${`${Math.round(LIMITS.staleJobMs / 1000)} seconds`}::interval`;
  return sql<JobRow[]>`
    select id, module, status, input, output, error, model, progress, started_at, finished_at
    from wizard.jobs where run_id = ${runId} order by started_at`;
}

export async function startJob(sql: Sql, runId: string, module: JobRow["module"], input: Record<string, unknown>) {
  try {
    const [job] = await sql<JobRow[]>`
      insert into wizard.jobs (run_id, module, input) values (${runId}, ${module}, ${sql.json(input as postgres.JSONValue)})
      returning id, module, status, input, output, error, model, progress, started_at, finished_at`;
    return job;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new InputError("Another module is still running for this run. Wait for it to finish.", 409);
    throw error;
  }
}

export async function setProgress(sql: Sql, id: string, progress: JobProgress) {
  await sql`update wizard.jobs set progress = ${sql.json(progress)} where id = ${id} and status = 'running'`;
}

export async function finishJob(sql: Sql, id: string, output: string, model: string, usage: unknown) {
  await sql`update wizard.jobs set status = 'succeeded', output = ${output}, model = ${model}, usage = ${sql.json((usage ?? null) as postgres.JSONValue)}, finished_at = now() where id = ${id}`;
}

export async function failJob(sql: Sql, id: string, message: string) {
  await sql`update wizard.jobs set status = 'failed', error = ${message.slice(0, 500)}, finished_at = now() where id = ${id}`;
}
