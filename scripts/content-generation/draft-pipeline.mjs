import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalArticleHash,
  createQaReport,
  loadConfiguration,
  orchestrate,
  parseContract,
} from "@ejwhite/content-engine";
import { FilesystemCheckpointStore } from "./filesystem-checkpoint-store.mjs";

export function evidenceVerificationSha256(evidence) {
  const identity = { brief_id: evidence.brief_id, records: evidence.records.map(({ evidence_id, canonical_url, content_sha256, supported_claim_ids }) => ({ evidence_id, canonical_url, content_sha256, supported_claim_ids })) };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function applyEvidenceVerification(evidence, verification, briefId) {
  verification = typeof verification === "function" ? verification(evidence) : verification;
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) throw new Error("an operator evidence-verification contract is required");
  if (verification.schema_version !== 1 || verification.brief_id !== briefId || typeof verification.reviewed_by !== "string" || !verification.reviewed_by.trim()) throw new Error("invalid operator evidence-verification identity");
  if (!Number.isFinite(Date.parse(verification.reviewed_at))) throw new Error("invalid operator evidence-verification timestamp");
  const ledgerSha256 = evidenceVerificationSha256(evidence);
  if (verification.evidence_ledger_sha256 !== ledgerSha256) throw new Error("operator evidence verification does not match the retrieved ledger");
  if (!Array.isArray(verification.decisions)) throw new Error("operator evidence verification decisions are required");
  const decisions = new Map();
  for (const decision of verification.decisions) {
    if (!decision || decisions.has(decision.evidence_id) || !["verified", "rejected"].includes(decision.status) || typeof decision.notes !== "string" || !decision.notes.trim()) throw new Error("invalid or duplicate operator evidence-verification decision");
    decisions.set(decision.evidence_id, decision);
  }
  if (decisions.size !== evidence.records.length) throw new Error("every retrieved evidence record requires an operator disposition");
  const records = evidence.records.map((record) => {
    const decision = decisions.get(record.evidence_id);
    if (!decision || decision.content_sha256 !== record.content_sha256) throw new Error(`operator evidence decision does not match ${record.evidence_id}`);
    if (!Array.isArray(decision.supported_claim_ids) || decision.supported_claim_ids.length === 0 || new Set(decision.supported_claim_ids).size !== decision.supported_claim_ids.length) throw new Error(`operator evidence decision has invalid claim mappings for ${record.evidence_id}`);
    if (decision.supported_claim_ids.some((id) => !record.supported_claim_ids.includes(id))) throw new Error(`operator evidence decision expands provider claim mappings for ${record.evidence_id}`);
    return { ...record, supported_claim_ids: decision.supported_claim_ids, verification_status: decision.status, verification_notes: `${verification.reviewed_by}: ${decision.notes}` };
  });
  return { ...evidence, records };
}

export const DRAFT_STAGES = [
  "brief-validation", "research", "outline", "rough-draft", "factual-audit",
  "search-audit", "brand-edit", "human-first-edit", "deterministic-validation",
];

function parseGeneratedJson(result, stage) {
  const source = result.text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try { return JSON.parse(source); }
  catch (error) { throw new Error(`${stage} returned invalid JSON`, { cause: error }); }
}

function withStageProvenance(input, stage, startedAt, endedAt, model) {
  return {
    ...input,
    pipeline_provenance: {
      ...(input.pipeline_provenance ?? {}),
      [stage]: { started_at: startedAt, ended_at: endedAt, ...(model ? { model } : {}) },
    },
  };
}

function normalizeArticleResponse(value, input, brief) {
  const article = value && typeof value === "object" && !Array.isArray(value) && value.article && typeof value.article === "object" && !Array.isArray(value.article)
    ? value.article
    : value;
  if (!article || typeof article !== "object" || Array.isArray(article)) return article;
  const evidenceByUrl = new Map((input?.evidence?.records ?? []).map((record) => [record.canonical_url, record.evidence_id]));
  const allowedLinks = new Set(brief.internal_link_targets.map(({ url }) => url));
  return {
    ...article,
    claims: Array.isArray(article.claims) ? article.claims.map((rawClaim) => {
      const claim = "text" in rawClaim ? rawClaim : {
        claim_id: rawClaim.claim_id,
        text: rawClaim.claim,
        material: true,
        support_type: "evidence",
        support_ids: (rawClaim.evidence_urls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean),
        ...(rawClaim.body_locator ? { body_locator: rawClaim.body_locator } : {}),
      };
      if (!claim.material || claim.support_type !== "evidence" || !Array.isArray(claim.support_ids)) return claim;
      return { ...claim, support_ids: claim.support_ids.filter((id) => {
        const record = input?.evidence?.records?.find(({ evidence_id }) => evidence_id === id);
        return record?.verification_status === "verified" && record.supported_claim_ids?.includes(claim.claim_id);
      }) };
    }) : [],
    internal_links: Array.isArray(article.internal_links) ? article.internal_links.map((link) => {
      if ("anchor" in link) return link;
      return { url: link.url, anchor: link.anchor_text, inventory_verified: allowedLinks.has(link.url) };
    }) : [],
  };
}

function articleWordCount(body) {
  return body.replace(/```[\s\S]*?```/gu, " ").replace(/https?:\/\/\S+/gu, " ").match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function validateFinalArticleResponse(article, input) {
  if (!article || typeof article !== "object" || Array.isArray(article)) throw new Error("human-first-edit must return an article object");
  const words = articleWordCount(typeof article.body === "string" ? article.body : "");
  if (words < 1200 || words > 1800) throw new Error(`human-first-edit article must contain 1200-1800 words; received ${words}`);
  const evidence = new Map((input?.evidence?.records ?? []).map((record) => [record.evidence_id, record]));
  for (const claim of Array.isArray(article.claims) ? article.claims : []) {
    if (!claim.material || claim.support_type !== "evidence") continue;
    if (!claim.body_locator || !article.body.includes(claim.body_locator) || !article.body.includes(claim.text)) {
      throw new Error(`human-first-edit claim ${claim.claim_id} must have exact body text and a body locator present in the article`);
    }
    if (!Array.isArray(claim.support_ids) || claim.support_ids.length === 0 || claim.support_ids.some((id) => !evidence.get(id)?.supported_claim_ids?.includes(claim.claim_id))) {
      throw new Error(`human-first-edit claim ${claim.claim_id} may use only evidence mapped to that claim`);
    }
  }
  return article;
}

function generationHandler(provider, stage, system, prompt, now, normalize = (value) => value, providerInput = (input) => input) {
  return { id: `${provider.id}:${stage}`, async run({ input, signal }) {
    const startedAt = now();
    const result = await provider.generate({ system, prompt, input: providerInput(input), maximumOutputTokens: 12000 }, signal);
    const output = withStageProvenance(input, stage, startedAt, now(), { provider: result.provider, identifier: result.model });
    return { ...output, [stage.replaceAll("-", "_")]: normalize(parseGeneratedJson(result, stage), input) };
  } };
}

function normalizedSourceType(sourceType, canonicalUrl) {
  const value = sourceType.toLowerCase().replaceAll(/[ -]+/gu, "_");
  const supported = new Set(["first_party_product", "government", "regulator", "standards_body", "peer_reviewed", "vendor_documentation", "company_primary", "reputable_secondary", "other"]);
  if (supported.has(value)) return value;
  const hostname = new URL(canonicalUrl).hostname;
  if (hostname.endsWith(".gov") || hostname === "uscode.house.gov") return "government";
  if (hostname.includes("nist.gov")) return "standards_body";
  return sourceType.startsWith("authoritative-web-source:") ? "company_primary" : "other";
}

function researchTasks(brief) {
  const planned = brief.source_plan.map((source) => {
    const plannedUrl = source.source_type.match(/^authoritative-web-source:(https:\/\/\S+)$/u)?.[1];
    return {
      query: plannedUrl ? `${brief.intent.primary_query} source:${plannedUrl}` : `${brief.intent.primary_query} ${source.claim_id}`,
      claimId: source.claim_id,
      sourceType: source.source_type,
      required: source.required,
      plannedUrl,
    };
  });
  const contextual = [brief.intent.primary_query, ...brief.supporting_queries].map((query) => ({ query, claimId: "research-context", sourceType: "other", required: false }));
  return planned.length ? [...planned, ...contextual.slice(1)] : contextual;
}

function evidenceLedger(brief, batches) {
  const merged = new Map();
  for (const { task, results } of batches) {
    for (const result of results) {
      const url = new URL(result.canonicalUrl);
      if (url.protocol !== "https:") throw new Error(`research citation must use HTTPS: ${result.canonicalUrl}`);
      const key = url.toString();
      const current = merged.get(key);
      const matchesPlannedUrl = !task.plannedUrl || new URL(task.plannedUrl).toString() === key;
      const support = matchesPlannedUrl ? task.claimId : "research-context";
      merged.set(key, {
        result,
        claimIds: new Set([...(current?.claimIds ?? []), support]),
        required: Boolean(current?.required || (task.required && matchesPlannedUrl)),
        sourceType: current && current.sourceType !== "other" ? current.sourceType : normalizedSourceType(task.sourceType, key),
      });
    }
  }
  return {
    schema_version: 1,
    brief_id: brief.content_id,
    records: [...merged.values()].map(({ result, claimIds, required, sourceType }, index) => ({
      evidence_id: `EV-${String(index + 1).padStart(3, "0")}`,
      canonical_url: result.canonicalUrl,
      title: result.title,
      source_owner: new URL(result.canonicalUrl).hostname,
      source_type: sourceType,
      retrieved_at: result.retrievedAt,
      factual_summary: result.summary,
      supported_claim_ids: [...claimIds],
      time_sensitive: true,
      primary_source_preference: { sought: true, result: "authoritative_used", reason: "Provider returned a retrievable URL for operator review." },
      verification_status: "retrieved",
      required,
      content_sha256: result.contentSha256,
    })),
  };
}

function buildArticle(brief, draft, input) {
  draft = normalizeArticleResponse(draft, input, brief);
  const date = new Date(brief.publishing.scheduled_at ?? 0).toISOString();
  const article = {
    schema_version: 1,
    content_id: brief.content_id,
    brief_id: brief.content_id,
    brand: brief.brand,
    profile_version: brief.profile_version,
    policy_versions: brief.policy_versions,
    title: draft.title,
    description: draft.description,
    slug: brief.publishing.slug,
    canonical_url: `https://growthcast.app/blog/${brief.publishing.slug}`,
    body: draft.body,
    author: brief.human_input.author,
    published_at: date,
    modified_at: date,
    claims: Array.isArray(draft.claims) ? draft.claims : [],
    internal_links: Array.isArray(draft.internal_links) ? draft.internal_links : [],
    media_requirements: [],
    qa_report_path: `artifacts/content-generation/${brief.content_id}/qa-report.json`,
    approval: null,
    content_sha256: "",
  };
  article.content_sha256 = canonicalArticleHash(article);
  return article;
}

async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await import("node:fs/promises").then(({ rename }) => rename(temporary, file));
}

function buildRunManifest({ brief, runId, checkpoint, endedAt, status }) {
  const latestOutput = [...checkpoint.records].reverse().find((record) => record.output)?.output;
  const stageTimes = latestOutput?.pipeline_provenance ?? {};
  const startedAt = checkpoint.records.length ? stageTimes[checkpoint.records[0].stage]?.started_at ?? endedAt : endedAt;
  return {
    schema_version: 1, run_id: runId, content_id: brief.content_id, brand: brief.brand,
    profile_version: brief.profile_version, policy_versions: brief.policy_versions,
    started_at: startedAt, ended_at: endedAt, status,
    stages: checkpoint.records.map((record) => {
      const provenance = stageTimes[record.stage] ?? { started_at: endedAt, ended_at: endedAt };
      return {
        name: record.stage, started_at: provenance.started_at, ended_at: provenance.ended_at,
        status: record.status === "completed" ? "completed" : "failed",
        prompt_template_version: "growthcast-draft-v1", input_sha256: record.inputSha256,
        output_sha256: record.outputSha256 ?? record.inputSha256,
        retry_count: Math.max(0, record.attempts - 1),
        validation_result: record.status === "completed" ? "pass" : "fail",
        ...(record.error ? { error_summary: record.error } : {}),
        ...(provenance.model ? { model: provenance.model } : {}),
      };
    }),
    publication_requested: false, redaction_applied: true,
  };
}

export async function runDraftPipeline({ brief: rawBrief, provider, evidenceVerification, runId, artifactDirectory, checkpointDirectory, maximumAttemptsPerStage = 3, now = () => new Date().toISOString() }) {
  const brief = await parseContract("brief", rawBrief);
  if (brief.status !== "approved" || !brief.approval) throw new Error(`${brief.content_id}: an approved brief with accountable approval is required`);

  const handlers = {
    "brief-validation": { id: "contract", run: async ({ input }) => {
      const startedAt = now();
      return withStageProvenance(input, "brief-validation", startedAt, now());
    } },
    research: { id: `${provider.id}:research`, run: async ({ input, signal }) => {
      const startedAt = now();
      const tasks = researchTasks(brief);
      const batches = await Promise.all(tasks.map(async (task) => ({
        task,
        results: await provider.research({ query: task.query, allowedSourceTypes: [task.sourceType], maximumResults: 5 }, signal),
      })));
      const evidence = evidenceLedger(brief, batches);
      await parseContract("evidence", evidence);
      const firstResult = batches.flatMap((batch) => batch.results)[0];
      const model = firstResult?.provider && firstResult?.model
        ? { provider: firstResult.provider, identifier: firstResult.model }
        : undefined;
      return { ...withStageProvenance(input, "research", startedAt, now(), model), evidence };
    } },
    outline: generationHandler(provider, "outline", "Return only JSON. Do not invent human observations or approval.", "Create an outline as a JSON object with an outline array.", now),
    "rough-draft": generationHandler(provider, "rough-draft", "Return only JSON. Cite evidence URLs inline. Do not invent human observations, approval, or results.", "Draft JSON with title, description, body, claims, and internal_links.", now),
    "factual-audit": generationHandler(provider, "factual-audit", "Return only JSON. Remove or qualify claims unsupported by the evidence ledger.", "Return a corrected article JSON object with title, description, body, claims, and internal_links.", now),
    "search-audit": generationHandler(provider, "search-audit", "Return only JSON. Improve search clarity without adding claims.", "Return the complete corrected article JSON object.", now),
    "brand-edit": generationHandler(provider, "brand-edit", "Return only JSON. Apply the GrowthCast profile without adding claims.", "Return the complete corrected article JSON object.", now),
    "human-first-edit": generationHandler(
      provider,
      "human-first-edit",
      "Return only JSON. Apply the human-first writing guide. Never invent human observations. Keep the body between 1200 and 1800 words. Every material evidence claim must use exact text present in the body, name a body_locator string also present in the body, and use only support_ids whose evidence record maps to that claim_id.",
      "Return the complete corrected article JSON object with title, description, body, claims, and internal_links.",
      now,
      (value, input) => {
        const verifiedInput = { ...input, evidence: applyEvidenceVerification(input.evidence, evidenceVerification, brief.content_id) };
        return validateFinalArticleResponse(normalizeArticleResponse(value, verifiedInput, brief), verifiedInput);
      },
      (input) => {
        const evidence = applyEvidenceVerification(input.evidence, evidenceVerification, brief.content_id);
        return { ...input, evidence: { ...evidence, records: evidence.records.filter(({ verification_status }) => verification_status === "verified") } };
      },
    ),
    "deterministic-validation": { id: "shared-qa", run: async ({ input }) => {
      const startedAt = now();
      const verifiedInput = { ...input, evidence: applyEvidenceVerification(input.evidence, evidenceVerification, brief.content_id) };
      const article = buildArticle(brief, verifiedInput.human_first_edit, verifiedInput);
      await parseContract("article", article);
      const { profiles } = await loadConfiguration();
      const qa = createQaReport(article, verifiedInput.evidence, profiles.growthcast, { generatedAt: new Date(0).toISOString() });
      await parseContract("qa-report", qa);
      return { ...withStageProvenance(verifiedInput, "deterministic-validation", startedAt, now()), article, qa };
    } },
  };

  // Bind durable checkpoints to the provider execution contract as well as the brief.
  // This prevents a stable run ID from silently reusing output produced by a different
  // model after an operator changes environment configuration.
  const execution = {
    pipeline_version: "growthcast-draft-v1",
    provider: provider.id,
    model: typeof provider.model === "string" ? provider.model : null,
  };
  const directory = path.resolve(artifactDirectory, runId);
  let checkpoint;
  try {
    checkpoint = await orchestrate({ brief, execution }, { runId, stages: DRAFT_STAGES, handlers, checkpointStore: new FilesystemCheckpointStore(checkpointDirectory), maximumAttemptsPerStage });
  } catch (error) {
    if (error?.checkpoint) {
      const failedManifest = buildRunManifest({ brief, runId, checkpoint: error.checkpoint, endedAt: now(), status: "failed" });
      await parseContract("run-manifest", failedManifest);
      await atomicJson(path.join(directory, "run-manifest.json"), failedManifest);
    }
    throw error;
  }
  const output = checkpoint.records.at(-1).output;
  const manifest = buildRunManifest({ brief, runId, checkpoint, endedAt: now(), status: "stopped_for_approval" });
  await parseContract("run-manifest", manifest);

  await Promise.all([
    atomicJson(path.join(directory, "evidence-ledger.json"), output.evidence),
    atomicJson(path.join(directory, "article.json"), output.article),
    atomicJson(path.join(directory, "qa-report.json"), output.qa),
    atomicJson(path.join(directory, "run-manifest.json"), manifest),
  ]);
  return { article: output.article, evidence: output.evidence, qa: output.qa, manifest, artifactDirectory: directory };
}
