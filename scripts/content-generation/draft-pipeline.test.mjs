import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDraftPipeline } from "./draft-pipeline.mjs";

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
  const article = { title: "A measured growth workflow", description: "A practical guide to bounding and reviewing one growth workflow.", body: "Use a bounded workflow backed by [NIST](https://www.nist.gov/itl/ai-risk-management-framework).\n\nRead [why GrowthCast](/why-growthcast).\n\n[Start a GrowthCast conversation](/?contact=1)", claims: [{ claim_id: "claim-1", text: "NIST publishes an AI risk framework.", material: true, support_type: "evidence", support_ids: ["EV-001"], body_locator: "paragraph-1" }], internal_links: [{ url: "/why-growthcast", anchor: "why GrowthCast", inventory_verified: true }, { url: "/?contact=1", anchor: "Start a GrowthCast conversation", inventory_verified: true }] };
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
    const options = { brief: approvedBrief(), provider: mock, runId: "review-run", now, ...dirs };
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
    expect(JSON.parse(await readFile(path.join(first.artifactDirectory, "evidence-ledger.json"), "utf8")).records[0]).toMatchObject({ verification_status: "retrieved", canonical_url: "https://www.nist.gov/itl/ai-risk-management-framework", source_type: "standards_body", supported_claim_ids: ["claim-1"], required: true });
    expect(mock.research).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("claim-1"), allowedSourceTypes: ["standards body"] }), undefined);
    await expect(readFile(dirs.source, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records a failed stage and resumes it without replaying completed stages", async () => {
    const dirs = await locations();
    const mock = provider();
    mock.generate.mockRejectedValueOnce(new Error("temporary generation failure"));
    mock.generate.mockRejectedValueOnce(new Error("temporary generation failure"));
    const options = { brief: approvedBrief(), provider: mock, runId: "recoverable-run", maximumAttemptsPerStage: 2, ...dirs };

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
    await runDraftPipeline({ brief: approvedBrief(), provider: firstProvider, runId: "model-bound-run", ...dirs });

    const changedProvider = provider();
    changedProvider.model = "mock-model-v2";
    await expect(runDraftPipeline({ brief: approvedBrief(), provider: changedProvider, runId: "model-bound-run", ...dirs }))
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
    await expect(runDraftPipeline({ brief, provider: mock, runId: "blocked-run", ...dirs })).rejects.toThrow("approved brief");
    expect(mock.research).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("does not attribute an unrelated returned URL to an exact planned source", async () => {
    const dirs = await locations();
    const mock = provider();
    const brief = approvedBrief();
    brief.source_plan = [{ claim_id: "claim-exact", source_type: "authoritative-web-source:https://example.com/planned", required: true }];
    mock.research.mockResolvedValue([{ canonicalUrl: "https://example.com/other", title: "Other", retrievedAt: "2026-09-04T00:00:00.000Z", contentSha256: "b".repeat(64), summary: "Other context." }]);
    const result = await runDraftPipeline({ brief, provider: mock, runId: "source-mismatch", ...dirs });
    expect(result.evidence.records[0]).toMatchObject({ supported_claim_ids: ["research-context"], required: false });
  });

});
