import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalSha256, renderFixtureOg, renderHero } from "@ejwhite/content-engine";
import { parseArguments, runCli } from "./cli.mjs";
import { createGrowthCastProductionRenderer } from "./production-renderer.mjs";

const directories = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function brief() {
  return { schema_version: 1, content_id: "approved-brief", brand: "growthcast", profile_version: "1.0.0", policy_versions: { "universal-editorial": "1.0.0", evidence: "1.0.0", "search-discoverability": "1.0.0" }, status: "approved", reader: { role: "SaaS founder", task: "choose a measured workflow" }, intent: { type: "implement", primary_query: "measured growth workflow", direct_answer: "Start with a bounded workflow." }, supporting_queries: [], angle: { thesis: "Bound the workflow.", non_obvious_point: "Review cost belongs in the model.", boundaries: ["No outcome claims."] }, outline: [{ heading: "Choose a workflow", questions: ["What should be bounded?"] }], human_input: { author: "EJ White", observations: [], opinions: [], examples: [], waiver: { reason: "Human input is intentionally deferred for this draft.", approved_by: "editor", approved_at: "2026-09-04T00:00:00.000Z" } }, product_facts: [], allowed_claims: [], prohibited_claims: ["Unverified outcomes"], source_plan: [{ claim_id: "claim-1", source_type: "standards body", required: true }], internal_link_targets: [{ url: "/why-growthcast", purpose: "Context" }, { url: "/?contact=1", purpose: "Conversation" }], conversion: { action: "Start a conversation", destination: "/?contact=1" }, publishing: { adapter: "astro-markdown", slug: "approved-brief", indexable: false, scheduled_at: "2026-09-10T12:00:00.000Z" }, approval: { approved_by: "editor", approved_at: "2026-09-04T00:00:00.000Z", scope: "intent-thesis-product-facts-prohibited-claims" } };
}

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "growthcast-cli-"));
  directories.push(root);
  const directory = path.join(root, "docs/content-briefs/contracts");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "approved-brief.json"), JSON.stringify(brief()));
  return root;
}

function mockedHttp() {
  const body = `## Choose a workflow\n\nNIST publishes an AI risk framework. See https://www.nist.gov/itl/ai-risk-management-framework. ${"Review assumptions, preserve evidence, and keep a person responsible for each final decision. ".repeat(110)}\n\nRead [why GrowthCast](/why-growthcast).\n\n[Start a GrowthCast conversation](/?contact=1)`;
  const article = { title: "A measured growth workflow", description: "A practical guide to bounding and reviewing one growth workflow.", body, claims: [{ claim_id: "claim-1", text: "NIST publishes an AI risk framework.", material: true, support_type: "evidence", support_ids: ["EV-001"], body_locator: "## Choose a workflow" }], internal_links: [{ url: "/why-growthcast", anchor: "why GrowthCast", inventory_verified: true }, { url: "/?contact=1", anchor: "Start a GrowthCast conversation", inventory_verified: true }] };
  return vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    const research = body.plugins?.[0]?.id === "web";
    const userMessage = body.messages?.[1]?.content || "";
    const generated = userMessage.includes("valid_body_locators")
      ? { inline: [{ body_locator: "## Choose a workflow", purpose: "Clarify the bounded workflow sequence", concept: "Abstract connected steps with a review gate", alt: "Connected workflow steps ending at a review gate", caption: "A bounded workflow pauses for review." }] }
      : (userMessage.includes("outline array") ? { outline: [{ heading: "Choose a workflow" }] } : article);
    const message = research ? { content: "NIST framework", annotations: [{ url_citation: { url: "https://www.nist.gov/itl/ai-risk-management-framework", title: "AI Risk Management Framework", content: "NIST publishes an AI risk management framework." } }] } : { content: JSON.stringify(generated) };
    return { ok: true, json: async () => ({ model: "mock-model", choices: [{ message }] }) };
  });
}


function mockedVisuals() {
  const imageProvider = { provider: "google", model: "gemini-3-pro-image", generate: vi.fn(async (request, prompt) => {
    const image = renderHero({ brand: "verdant", contentId: request.content_id, articleSha256: request.article_sha256, profileVersion: request.brand_profile_version, title: "inline" });
    return { bytes: image.bytes, mime_type: "image/png", provider: "google", model: "gemini-3-pro-image", prompt_sha256: canonicalSha256(prompt), retry_count: 0 };
  }) };
  const renderer = { render: vi.fn(async (request, article) => {
    const input = { brand: request.brand, contentId: request.content_id, articleSha256: request.article_sha256, profileVersion: request.brand_profile_version, title: article.title };
    const image = request.kind === "og" ? renderFixtureOg(input) : renderHero(input, request.kind === "thumbnail");
    return { bytes: image.bytes, mime_type: "image/png", renderer: { name: "mock-certified-production-renderer", version: "1.0.0", library_versions: { mock: "1.0.0" } }, prompt_sha256: canonicalSha256(request) };
  }) };
  return { imageProvider, renderer };
}

const env = { OPENROUTER_API_KEY: "test-only", OPENROUTER_MODEL: "mock-model", OPENROUTER_BASE_URL: "https://mock.invalid" };

describe("generation operator CLI", () => {
  it("rejects source writes in shadow mode", () => {
    expect(() => parseArguments(["approved-brief", "--shadow", "--write-to-src"])).toThrow(
      "--shadow cannot be combined with --write-to-src",
    );
  });

  it("rejects approvals and every source-write path in shadow mode", () => {
    expect(() => parseArguments(["approved-brief", "--shadow", "--approval-file", "approval.json"])).toThrow("approval must remain null");
    expect(() => parseArguments(["approved-brief", "--shadow", "--upload"])).toThrow("Unknown argument");
    expect(() => parseArguments(["approved-brief", "--shadow", "--publish"])).toThrow("Unknown argument");
    for (const forbidden of ["--sanity", "--deploy", "--index", "--database", "--materialize"]) {
      expect(() => parseArguments(["approved-brief", "--shadow", forbidden])).toThrow("Unknown argument");
    }
  });

  it("fails before HTTP when credentials are missing", async () => {
    const root = await workspace();
    const fetchImpl = vi.fn();
    await expect(runCli(["approved-brief"], { root, env: {}, fetchImpl })).rejects.toThrow("OPENROUTER_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates resumable shadow artifacts and never writes source by default", async () => {
    const root = await workspace();
    const fetchImpl = mockedHttp();
    const visuals = mockedVisuals();
    const dependencies = { root, env, fetchImpl, ...visuals, now: () => "2026-09-05T00:00:00.000Z" };
    const first = await runCli(["approved-brief", "--shadow", "--run-id", "shadow-review"], dependencies);
    const resumed = await runCli(["approved-brief", "--shadow", "--run-id", "shadow-review"], dependencies);
    expect(resumed).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(visuals.imageProvider.generate).toHaveBeenCalledTimes(1);
    expect(visuals.renderer.render).toHaveBeenCalledTimes(3);
    expect(first).toMatchObject({
      mode: "shadow",
      source_written: null,
      source_materialization_requested: false,
      storage_upload_requested: false,
      sanity_requested: false,
      database_write_requested: false,
      deploy_hook_invoked: false,
      indexing_requested: false,
      publication_requested: false,
      publication_approval: null,
    });
    expect(first.asset_manifest_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.publication_bundle_sha256).toMatch(/^[a-f0-9]{64}$/u);
    await expect(readFile(path.join(root, "src/content/blog/approved-brief.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires the write flag, accepts only an exact approval hash, and writes a draft without overwriting", async () => {
    const root = await workspace();
    const fetchImpl = mockedHttp();
    const initial = await runCli(["approved-brief", "--run-id", "approved-run"], { root, env, fetchImpl });
    const approvalFile = path.join(root, "approval.json");
    await writeFile(approvalFile, JSON.stringify({ status: "approved", approved_by: "human editor", approved_at: "2026-09-04T00:00:00.000Z", content_sha256: initial.content_sha256 }));
    const written = await runCli(["approved-brief", "--run-id", "approved-run", "--approval-file", approvalFile, "--write-to-src"], { root, env, fetchImpl });
    expect(written.approval_matches).toBe(true);
    expect(await readFile(path.join(root, written.source_written), "utf8")).toContain("draft: true");
    await expect(runCli(["approved-brief", "--run-id", "approved-run", "--write-to-src"], { root, env, fetchImpl })).rejects.toThrow("refusing to overwrite");
    await writeFile(approvalFile, JSON.stringify({ status: "approved", approved_by: "human editor", approved_at: "2026-09-04T00:00:00.000Z", content_sha256: "f".repeat(64) }));
    await expect(runCli(["approved-brief", "--run-id", "approved-run", "--approval-file", approvalFile], { root, env, fetchImpl })).rejects.toThrow("approval content hash does not match");
  });
  it("uses a deterministic certified GrowthCast renderer with exact-title Manrope/logo OG", async () => {
    const renderer = createGrowthCastProductionRenderer();
    const article = { content_id: "renderer-proof", content_sha256: "b".repeat(64), brand: "growthcast", profile_version: "1.0.0", title: "An exact title for a measured growth workflow" };
    const request = (kind) => ({ content_id: article.content_id, article_sha256: article.content_sha256, brand: article.brand, kind, brand_profile_version: article.profile_version });
    const hero = await renderer.render(request("hero"), article);
    const heroAgain = await renderer.render(request("hero"), article);
    const thumbnail = await renderer.render(request("thumbnail"), article);
    const og = await renderer.render(request("og"), article);
    const ogAgain = await renderer.render(request("og"), article);
    expect(hero.bytes).toEqual(heroAgain.bytes);
    expect(og.bytes).toEqual(ogAgain.bytes);
    expect(hero.bytes).not.toEqual(thumbnail.bytes);
    expect(og.renderer).toMatchObject({ name: "certified-growthcast-compositor", library_versions: { opentype: "1.3.4" } });
    const changed = await renderer.render(request("og"), { ...article, title: `${article.title} revised` });
    expect(changed.bytes).not.toEqual(og.bytes);
    await expect(renderer.render({ ...request("hero"), brand: "verdant" }, article)).rejects.toThrow("foreign brands");
  });

});
