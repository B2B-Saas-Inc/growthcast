import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEvidenceVerification, evidenceVerificationSha256, runDraftPipeline, validateFinalArticleResponse } from "./draft-pipeline.mjs";


function verification({ url = "https://www.nist.gov/itl/ai-risk-management-framework", hash = "a".repeat(64), claimIds = ["claim-1"], required = true, sourceType = "standards_body" } = {}) {
  const evidence = { schema_version: 1, brief_id: "approved-brief", records: [{ evidence_id: "EV-001", canonical_url: url, title: url.includes("nist.gov") ? "AI Risk Management Framework" : "Other", source_owner: new URL(url).hostname, source_type: sourceType, retrieved_at: "2026-09-04T00:00:00.000Z", factual_summary: url.includes("nist.gov") ? "NIST publishes an AI risk management framework." : "Other context.", supported_claim_ids: claimIds, time_sensitive: true, primary_source_preference: { sought: true, result: "authoritative_used", reason: "Provider returned a retrievable URL for operator review." }, verification_status: "retrieved", required, content_sha256: hash }] };
  return { schema_version: 1, brief_id: "approved-brief", reviewed_by: "EJ White", reviewed_at: "2026-09-07T18:10:00.000Z", evidence_ledger_sha256: evidenceVerificationSha256(evidence), decisions: [{ evidence_id: "EV-001", content_sha256: hash, supported_claim_ids: claimIds, status: "verified", notes: "Source and listed claim mapping manually reviewed." }] };
}

const directories = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function approvedBrief() {
  return {
    schema_version: 1, content_id: "approved-brief", brand: "growthcast", profile_version: "1.0.0",
    policy_versions: { "universal-editorial": "1.0.0", evidence: "1.0.0", "search-discoverability": "1.0.0" },
    status: "approved", reader: { role: "SaaS founder", task: "choose a measured workflow" },
    intent: { type: "implement", primary_query: "measured growth workflow", direct_answer: "Start with a bounded workflow." },
    supporting_queries: [], angle: { thesis: "Bound the workflow.", non_obvious_point: "Review cost belongs in the model.", boundaries: ["No outcome claims."] },
    outline: [{ heading: "Choose a workflow", questions: ["What should be bounded?"] }],
    human_input: { author: "EJ White", observations: [], opinions: [], examples: [], waiver: { reason: "Human input is intentionally deferred for this draft.", approved_by: "editor", approved_at: "2026-09-04T00:00:00.000Z" } },
    product_facts: [], allowed_claims: [], prohibited_claims: ["Unverified outcomes"],
    source_plan: [{ claim_id: "claim-1", source_type: "standards body", required: true }],
    internal_link_targets: [{ url: "/why-growthcast", purpose: "Context" }, { url: "/?contact=1", purpose: "Conversation" }],
    conversion: { action: "Start a conversation", destination: "/?contact=1" },
    publishing: { adapter: "astro-markdown", slug: "approved-brief", indexable: false, scheduled_at: "2026-09-10T12:00:00.000Z" },
    approval: { approved_by: "editor", approved_at: "2026-09-04T00:00:00.000Z", scope: "intent-thesis-product-facts-prohibited-claims" },
  };
}

async function locations() {
  const root = await mkdtemp(path.join(os.tmpdir(), "growthcast-pipeline-"));
  directories.push(root);
  return { artifactDirectory: path.join(root, "artifacts"), checkpointDirectory: path.join(root, "checkpoints"), source: path.join(root, "src", "content", "blog", "approved-brief.md") };
}

function provider() {
  let generation = 0;
  const body = `## Choose a workflow\n\nNIST publishes an AI risk framework. See https://www.nist.gov/itl/ai-risk-management-framework. ${"Review the assumptions, record the evidence, and keep a person responsible for the final decision. ".repeat(100)}\n\nRead [why GrowthCast](/why-growthcast).\n\n[Start a GrowthCast conversation](/?contact=1)`;
  const article = { title: "A measured growth workflow", description: "A practical guide to bounding and reviewing one growth workflow.", body, claims: [{ claim_id: "claim-1", text: "NIST publishes an AI risk framework.", material: true, support_type: "evidence", support_ids: ["EV-001"], body_locator: "## Choose a workflow" }], internal_links: [{ url: "/why-growthcast", anchor: "why GrowthCast", inventory_verified: true }, { url: "/?contact=1", anchor: "Start a GrowthCast conversation", inventory_verified: true }] };
  return {
    id: "mock-http",
    model: "mock-model-v1",
    research: vi.fn(async () => [{ canonicalUrl: "https://www.nist.gov/itl/ai-risk-management-framework", title: "AI Risk Management Framework", retrievedAt: "2026-09-04T00:00:00.000Z", contentSha256: "a".repeat(64), summary: "NIST publishes an AI risk management framework.", provider: "mock-http", model: "research-model" }]),
    generate: vi.fn(async (request) => ({ text: JSON.stringify(request.prompt.includes("outline array") ? { outline: [{ heading: "Choose a workflow" }] } : article), provider: "mock-http", model: `generation-model-${++generation}` })),
  };
}

describe("runDraftPipeline", () => {
  it("creates cited review artifacts, resumes, and never writes source or requests publication", async () => {
    const dirs = await locations();
    const mock = provider();
    const timestamps = Array.from({ length: 40 }, (_, index) => new Date(index * 1000).toISOString());
    const now = vi.fn(() => timestamps.shift());
    const options = { brief: approvedBrief(), provider: mock, runId: "review-run", now, evidenceVerification: verification(), ...dirs };
    const first = await runDraftPipeline(options);
    const resumed = await runDraftPipeline(options);

    expect(resumed.article).toEqual(first.article);
    expect(mock.research).toHaveBeenCalledTimes(1);
    expect(mock.generate).toHaveBeenCalledTimes(6);
    expect(first.article.body).toContain("https://www.nist.gov/");
    expect(first.article.approval).toBeNull();
    expect(first.manifest).toMatchObject({ status: "stopped_for_approval", publication_requested: false });
    expect(first.manifest.started_at).toBe("1970-01-01T00:00:00.000Z");
    expect(first.manifest.ended_at).not.toBe(first.manifest.started_at);
    expect(first.manifest.stages.find(({ name }) => name === "research")).toMatchObject({
      started_at: "1970-01-01T00:00:02.000Z",
      ended_at: "1970-01-01T00:00:03.000Z",
      model: { provider: "mock-http", identifier: "research-model" },
    });
    expect(first.manifest.stages.find(({ name }) => name === "outline").model.identifier).toBe("generation-model-1");
    expect(first.manifest.stages.find(({ name }) => name === "human-first-edit").model.identifier).toBe("generation-model-6");
    expect(first.manifest.stages.find(({ name }) => name === "deterministic-validation").model).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(first.artifactDirectory, "evidence-ledger.json"), "utf8")).records[0]).toMatchObject({ verification_status: "verified", canonical_url: "https://www.nist.gov/itl/ai-risk-management-framework", source_type: "standards_body", supported_claim_ids: ["claim-1"], required: true });
    expect(mock.research).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("claim-1"), allowedSourceTypes: ["standards body"] }), undefined);
    await expect(readFile(dirs.source, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("normalizes an article wrapper returned by the human-first stage", async () => {
    const dirs = await locations();
    const mock = provider();
    const generate = mock.generate;
    mock.generate = vi.fn(async (request) => {
      const result = await generate(request);
      return request.prompt.includes("complete corrected article JSON object") && generate.mock.calls.length === 6
        ? { ...result, text: JSON.stringify({ article: {
          ...JSON.parse(result.text),
          claims: [{ claim_id: "claim-1", claim: "NIST publishes an AI risk framework.", body_locator: "## Choose a workflow", evidence_urls: ["https://www.nist.gov/itl/ai-risk-management-framework"] }],
          internal_links: [{ url: "/why-growthcast", anchor_text: "why GrowthCast", purpose: "Context" }],
        } }) }
        : result;
    });

    const result = await runDraftPipeline({ brief: approvedBrief(), provider: mock, runId: "wrapped-human-first", evidenceVerification: verification(), ...dirs });
    expect(result.article).toMatchObject({ title: "A measured growth workflow", approval: null });
    expect(result.article.body).toContain("https://www.nist.gov/");
    expect(result.article.claims[0]).toMatchObject({ text: "NIST publishes an AI risk framework.", material: true, support_type: "evidence", support_ids: ["EV-001"] });
    expect(result.article.internal_links[0]).toEqual({ url: "/why-growthcast", anchor: "why GrowthCast", inventory_verified: true });
  });

  it("passes only operator-verified evidence and its narrowed claim allowlist to final prose", async () => {
    const dirs = await locations();
    const mock = provider();
    const originalGenerate = mock.generate;
    mock.research.mockResolvedValue([
      { canonicalUrl: "https://www.nist.gov/itl/ai-risk-management-framework", title: "AI Risk Management Framework", retrievedAt: "2026-09-04T00:00:00.000Z", contentSha256: "a".repeat(64), summary: "NIST publishes an AI risk management framework.", provider: "mock-http", model: "research-model" },
      { canonicalUrl: "https://example.com/context", title: "Context", retrievedAt: "2026-09-04T00:00:00.000Z", contentSha256: "b".repeat(64), summary: "Unverified context.", provider: "mock-http", model: "research-model" },
    ]);
    mock.generate = vi.fn(async (request) => {
      if (request.system.includes("human-first writing guide")) {
        expect(request.input.evidence.records).toHaveLength(1);
        expect(request.input.evidence.records[0]).toMatchObject({ evidence_id: "EV-001", verification_status: "verified", supported_claim_ids: ["claim-1"] });
        const result = await originalGenerate(request);
        const article = JSON.parse(result.text);
        article.claims[0].support_ids = ["EV-002"];
        return { ...result, text: JSON.stringify(article) };
      }
      return originalGenerate(request);
    });
    const evidenceVerification = (ledger) => ({
      schema_version: 1, brief_id: "approved-brief", reviewed_by: "EJ White", reviewed_at: "2026-09-07T18:10:00.000Z", evidence_ledger_sha256: evidenceVerificationSha256(ledger),
      decisions: ledger.records.map((record) => ({ evidence_id: record.evidence_id, content_sha256: record.content_sha256, supported_claim_ids: record.supported_claim_ids, status: record.canonical_url.includes("nist.gov") ? "verified" : "rejected", notes: record.canonical_url.includes("nist.gov") ? "Claim mapping reviewed." : "Not suitable for factual support." })),
    });
    const result = await runDraftPipeline({ brief: approvedBrief(), provider: mock, runId: "verified-allowlist", evidenceVerification, ...dirs });
    expect(result.article.claims[0].support_ids).toEqual(["EV-001"]);
  });

  it("records a failed stage and resumes it without replaying completed stages", async () => {
    const dirs = await locations();
    const mock = provider();
    mock.generate.mockRejectedValueOnce(new Error("temporary generation failure"));
    mock.generate.mockRejectedValueOnce(new Error("temporary generation failure"));
    const options = { brief: approvedBrief(), provider: mock, runId: "recoverable-run", maximumAttemptsPerStage: 2, evidenceVerification: verification(), ...dirs };

    await expect(runDraftPipeline(options)).rejects.toThrow("outline failed after 2 attempts");
    const failedManifest = JSON.parse(await readFile(path.join(dirs.artifactDirectory, "recoverable-run", "run-manifest.json"), "utf8"));
    expect(failedManifest).toMatchObject({ status: "failed", publication_requested: false });
    expect(failedManifest.stages.at(-1)).toMatchObject({ name: "outline", status: "failed", retry_count: 1, validation_result: "fail", error_summary: "temporary generation failure" });
    expect(mock.research).toHaveBeenCalledTimes(1);

    const resumed = await runDraftPipeline(options);
    expect(resumed.manifest.status).toBe("stopped_for_approval");
    expect(mock.research).toHaveBeenCalledTimes(1);
    expect(mock.generate).toHaveBeenCalledTimes(8);
  });

  it("fails closed instead of resuming output from a different configured model", async () => {
    const dirs = await locations();
    const firstProvider = provider();
    await runDraftPipeline({ brief: approvedBrief(), provider: firstProvider, runId: "model-bound-run", evidenceVerification: verification(), ...dirs });

    const changedProvider = provider();
    changedProvider.model = "mock-model-v2";
    await expect(runDraftPipeline({ brief: approvedBrief(), provider: changedProvider, runId: "model-bound-run", evidenceVerification: verification(), ...dirs }))
      .rejects.toThrow("resume input does not match checkpoint");
    expect(changedProvider.research).not.toHaveBeenCalled();
    expect(changedProvider.generate).not.toHaveBeenCalled();
  });

  it("rejects briefs without real accountable approval before calling providers", async () => {
    const dirs = await locations();
    const mock = provider();
    const brief = approvedBrief();
    brief.status = "proposed";
    brief.approval = null;
    await expect(runDraftPipeline({ brief, provider: mock, runId: "blocked-run", evidenceVerification: verification(), ...dirs })).rejects.toThrow("approved brief");
    expect(mock.research).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("does not attribute an unrelated returned URL to an exact planned source", async () => {
    const dirs = await locations();
    const mock = provider();
    const brief = approvedBrief();
    brief.source_plan = [{ claim_id: "claim-exact", source_type: "authoritative-web-source:https://example.com/planned", required: true }];
    mock.research.mockResolvedValue([{ canonicalUrl: "https://example.com/other", title: "Other", retrievedAt: "2026-09-04T00:00:00.000Z", contentSha256: "b".repeat(64), summary: "Other context." }]);
    const originalGenerate = mock.generate;
    mock.generate = vi.fn(async (request) => {
      const generated = await originalGenerate(request);
      if (request.prompt.includes("outline array")) return generated;
      return { ...generated, text: JSON.stringify({ ...JSON.parse(generated.text), claims: [] }) };
    });
    const result = await runDraftPipeline({ brief, provider: mock, runId: "source-mismatch", evidenceVerification: verification({ url: "https://example.com/other", hash: "b".repeat(64), claimIds: ["research-context"], required: false, sourceType: "company_primary" }), ...dirs });
    expect(result.evidence.records[0]).toMatchObject({ supported_claim_ids: ["research-context"], required: false });
  });


  it("promotes only exact operator-reviewed evidence and fails closed on mismatch", () => {
    const contract = verification();
    const evidence = { schema_version: 1, brief_id: "approved-brief", records: [{ evidence_id: "EV-001", canonical_url: "https://www.nist.gov/itl/ai-risk-management-framework", title: "AI Risk Management Framework", source_owner: "www.nist.gov", source_type: "standards_body", retrieved_at: "2026-09-04T00:00:00.000Z", factual_summary: "NIST publishes an AI risk management framework.", supported_claim_ids: ["claim-1"], time_sensitive: true, primary_source_preference: { sought: true, result: "authoritative_used", reason: "Provider returned a retrievable URL for operator review." }, verification_status: "retrieved", required: true, content_sha256: "a".repeat(64) }] };
    expect(applyEvidenceVerification(evidence, contract, "approved-brief").records[0]).toMatchObject({ verification_status: "verified", supported_claim_ids: ["claim-1"] });
    expect(() => applyEvidenceVerification(evidence, { ...contract, evidence_ledger_sha256: "0".repeat(64) }, "approved-brief")).toThrow("does not match");
  });

  it("rejects final prose with missing locators, cross-claim evidence, or out-of-profile length", () => {
    const input = { evidence: { records: [{ evidence_id: "EV-001", supported_claim_ids: ["claim-1"] }] } };
    const valid = {
      body: `## Evidence\n\nA supported claim. ${"Use plain language and preserve editorial accountability throughout the review process. ".repeat(110)}`,
      claims: [{ claim_id: "claim-1", text: "A supported claim.", material: true, support_type: "evidence", support_ids: ["EV-001"], body_locator: "## Evidence" }],
    };
    expect(validateFinalArticleResponse(valid, input)).toBe(valid);
    expect(() => validateFinalArticleResponse({ ...valid, body: "Too short." }, input)).toThrow("1200-1800 words");
    expect(() => validateFinalArticleResponse({ ...valid, claims: [{ ...valid.claims[0], support_ids: ["EV-999"] }] }, input)).toThrow("only evidence mapped");
    expect(() => validateFinalArticleResponse({ ...valid, claims: [{ ...valid.claims[0], body_locator: "## Missing" }] }, input)).toThrow("body locator");
  });

});
