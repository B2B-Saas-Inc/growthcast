// Runs one Positioning Wizard module end to end: prepares evidence, calls the model, and records the job.
import { LIMITS, type WizardEnv } from "./config.js";
import { fetchPageText } from "./fetch-url.js";
import { chat, type ChatResult } from "./openrouter.js";
import { citationsAppendix, evidenceBlock, modulePrompt, researchPrompt, revisionPrompt, type EvidenceItem, type Priors, type RunFacts } from "./prompts.js";
import * as store from "./store.js";
import { InputError, type moduleRequest, type ResearchBrief } from "./validate.js";

type Request = ReturnType<typeof moduleRequest>;
type Deps = { sql: store.Sql; env: WizardEnv; chatImpl?: typeof chat; fetchPage?: typeof fetchPageText; now?: () => Date };

const latest = (jobs: store.JobRow[], module: store.JobRow["module"]) =>
  [...jobs].reverse().find((j) => j.module === module && j.status === "succeeded" && j.output)?.output ?? null;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

/** Turns pending links into page text and pending PDFs into Markdown. Failures are recorded per item. */
export async function prepareEvidence(deps: Deps, rows: store.EvidenceRow[], signal: AbortSignal) {
  const chatImpl = deps.chatImpl ?? chat;
  const fetchPage = deps.fetchPage ?? fetchPageText;
  const pending = rows.filter((r) => r.status === "pending");
  await pool(pending.filter((r) => r.kind === "url"), 4, async (row) => {
    try {
      const page = await fetchPage(row.url!);
      const content = `${page.title ? `Title: ${page.title}\n` : ""}${page.text}`.slice(0, LIMITS.evidenceCharsPerSource * 2);
      await store.setEvidence(deps.sql, row.id, { content, status: "ready" });
      Object.assign(row, { content, status: "ready" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The page could not be loaded.";
      await store.setEvidence(deps.sql, row.id, { status: "failed", error: message });
      Object.assign(row, { status: "failed", error: message });
    }
  });
  await pool(pending.filter((r) => r.kind === "upload" && r.mime === "application/pdf"), 2, async (row) => {
    try {
      const result = await chatImpl(deps.env.openRouter, {
        system: "Transcribe the attached document to Markdown. Keep wording exactly, including quotes, tables and speaker labels. Return only the transcription.",
        user: [
          { type: "text", text: `Document: ${row.name}` },
          { type: "file", file: { filename: row.name, file_data: `data:application/pdf;base64,${row.content}` } },
        ],
        pdf: true,
        maxTokens: 16_000,
        signal,
      });
      await store.setEvidence(deps.sql, row.id, { content: result.text, status: "ready" });
      Object.assign(row, { content: result.text, status: "ready" });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : "The PDF could not be read.";
      await store.setEvidence(deps.sql, row.id, { status: "failed", error: message });
      Object.assign(row, { status: "failed", error: message });
    }
  });
}

const toItems = (rows: store.EvidenceRow[]): EvidenceItem[] =>
  rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, url: r.url, urlType: r.url_type, note: r.note, content: r.status === "ready" ? r.content : null }));

export function checkLimits(req: Request, jobs: store.JobRow[], run: store.RunRow) {
  if (jobs.length >= LIMITS.jobsPerRun) throw new InputError("This run has reached its module limit.");
  if (req.reviseJobId) {
    const target = jobs.find((j) => j.id === req.reviseJobId && j.status === "succeeded");
    if (!target) throw new InputError("Choose a finished document to revise.");
    const used = jobs.filter((j) => j.input.reviseJobId && j.module === target.module).length;
    if (used >= LIMITS.revisionsPerModule) throw new InputError(`Each module allows ${LIMITS.revisionsPerModule} revisions per run.`);
    return target;
  }
  if (req.module === "copy" && jobs.filter((j) => j.module === "copy" && !j.input.reviseJobId && j.status === "succeeded").length >= LIMITS.copyPerRun) {
    throw new InputError(`Each run allows ${LIMITS.copyPerRun} copy pieces.`);
  }
  if (req.module === "positioning" && !latest(jobs, "jtbd")) throw new InputError("Run the Jobs-to-be-Done analysis first.");
  if (req.module === "pmm" && (!latest(jobs, "positioning") || !run.icp)) throw new InputError("Finish positioning and choose an ICP first.");
  if (req.module === "copy" && !latest(jobs, "pmm")) throw new InputError("Create the ICP guidance first.");
  return null;
}

export async function runModule(deps: Deps, run: store.RunRow, req: Request) {
  const { sql, env } = deps;
  const chatImpl = deps.chatImpl ?? chat;
  const jobs = await store.listJobs(sql, run.id);
  const target = checkLimits(req, jobs, run);
  const module = target?.module ?? req.module;
  const job = await store.startJob(sql, run.id, module, {
    ...(req.reviseJobId ? { reviseJobId: req.reviseJobId } : {}),
    ...(req.copy ? { copy: req.copy } : {}),
    ...(req.notes ? { notes: req.notes } : {}),
  });

  const signal = AbortSignal.timeout(LIMITS.jobTimeoutMs);
  const accessDate = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  const facts: RunFacts = { product: run.product, feature: run.feature, website: run.website, audience: run.audience, icp: run.icp };
  try {
    let result: ChatResult;
    if (target) {
      const p = revisionPrompt(target.module, facts, target.output!, req.notes);
      result = await chatImpl(env.openRouter, { ...p, maxTokens: 16_000, signal });
    } else if (module === "research") {
      const rows = await store.listEvidence(sql, run.id);
      await prepareEvidence(deps, rows, signal);
      const brief = { kinds: [], competitors: "", queries: "", audience: "", depth: "standard", ...run.research_brief } as ResearchBrief;
      const p = researchPrompt(facts, toItems(rows), brief, req.notes, accessDate);
      result = await chatImpl(env.openRouter, { system: p.system, user: p.user, web: p.web, maxTokens: 16_000, signal });
      result = { ...result, text: result.text + citationsAppendix(result.citations, accessDate) };
    } else {
      const priors: Priors = { research: latest(jobs, "research"), jtbd: latest(jobs, "jtbd"), positioning: latest(jobs, "positioning"), pmm: latest(jobs, "pmm") };
      let rawEvidence: string | undefined;
      if (module === "jtbd" && !priors.research) {
        const rows = await store.listEvidence(sql, run.id);
        await prepareEvidence(deps, rows, signal);
        rawEvidence = evidenceBlock(toItems(rows));
      }
      const p = modulePrompt(module, facts, priors, { notes: req.notes, copy: req.copy, rawEvidence });
      const useWeb = module === "jtbd" && !priors.research;
      result = await chatImpl(env.openRouter, { ...p, web: useWeb ? { maxResults: 8 } : undefined, maxTokens: 16_000, signal });
      if (useWeb) result = { ...result, text: result.text + citationsAppendix(result.citations, accessDate) };
    }
    await store.finishJob(sql, job.id, result.text, result.model, result.usage);
    return { ...job, status: "succeeded" as const, output: result.text };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("Positioning Wizard module failed", { module, error: raw.slice(0, 300) });
    const message = signal.aborted
      ? "The module took too long. Try again, or reduce the evidence."
      : /OpenRouter|model returned/iu.test(raw)
        ? "The AI service could not complete this step. Try again in a minute."
        : "The module failed. Try again.";
    await store.failJob(sql, job.id, message);
    return { ...job, status: "failed" as const, error: message };
  }
}
