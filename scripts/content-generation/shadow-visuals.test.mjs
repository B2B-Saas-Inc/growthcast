import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalArticleHash, canonicalSha256, renderFixtureOg, renderHero } from "@ejwhite/content-engine";
import { runShadowVisualStages } from "./shadow-visuals.mjs";

const directories = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function article() {
  const unsigned = { schema_version: 1, content_id: "visual-article", brief_id: "visual-article", brand: "growthcast", profile_version: "1.0.0", policy_versions: { "universal-editorial": "1.0.0", evidence: "1.0.0", "search-discoverability": "1.0.0" }, title: "A measured workflow", description: "A bounded workflow for evidence-led review and safer decisions.", slug: "visual-article", canonical_url: "https://growthcast.app/blog/visual-article", body: "## Review the evidence\n\nCompare the evidence before making a decision.", author: "EJ White", published_at: "2026-09-10T00:00:00.000Z", modified_at: "2026-09-10T00:00:00.000Z", claims: [], internal_links: [], media_requirements: [], qa_report_path: "artifacts/qa.json", approval: null, content_sha256: "" };
  return { ...unsigned, content_sha256: canonicalArticleHash(unsigned) };
}

function dependencies() {
  const proseProvider = { generate: vi.fn(async () => ({ text: JSON.stringify({ inline: [{ body_locator: "## Review the evidence", purpose: "Explain the evidence review sequence", concept: "Connected gates moving from source review to a decision", alt: "Connected evidence review gates leading toward a decision", caption: "A conceptual evidence-review sequence without measured outcomes." }] }) })) };
  const imageProvider = { provider: "google", model: "gemini-3-pro-image", generate: vi.fn(async (request, prompt) => { const image = renderHero({ brand: "verdant", contentId: request.content_id, articleSha256: request.article_sha256, profileVersion: request.brand_profile_version, title: "inline" }); return { bytes: image.bytes, mime_type: "image/png", provider: "google", model: "gemini-3-pro-image", prompt_sha256: canonicalSha256(prompt), retry_count: 0 }; }) };
  const renderer = { render: vi.fn(async (request, currentArticle) => { const input = { brand: request.brand, contentId: request.content_id, articleSha256: request.article_sha256, profileVersion: request.brand_profile_version, title: currentArticle.title }; const image = request.kind === "og" ? renderFixtureOg(input) : renderHero(input, request.kind === "thumbnail"); return { bytes: image.bytes, mime_type: "image/png", renderer: { name: "mock-production-compositor", version: "1.0.0", library_versions: { mock: "1.0.0" } }, prompt_sha256: canonicalSha256(request) }; }) };
  return { proseProvider, imageProvider, renderer };
}

describe("GrowthCast shadow visual stages", () => {
  it("creates a complete approval-null bundle and resumes every successful asset", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-visuals-")); directories.push(directory);
    const deps = dependencies();
    const options = { article: article(), artifactDirectory: directory, now: () => "2026-09-06T00:00:00.000Z", ...deps };
    const first = await runShadowVisualStages(options);
    const resumed = await runShadowVisualStages(options);
    expect(first.manifest.assets.map(({ request }) => request.kind)).toEqual(["inline-illustration", "hero", "thumbnail", "og"]);
    expect(first.bundle.approval).toBeNull();
    expect(resumed.reused_asset_ids).toHaveLength(4);
    expect(deps.proseProvider.generate).toHaveBeenCalledTimes(1);
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(1);
    expect(deps.renderer.render).toHaveBeenCalledTimes(3);
    expect(JSON.parse(await readFile(path.join(directory, "publication-bundle.json"), "utf8")).publication_bundle_sha256).toBe(first.bundle.publication_bundle_sha256);
  });

  it("invalidates a tampered binary without repeating other provider calls and rejects invented factual visuals", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-visuals-")); directories.push(directory);
    const deps = dependencies();
    const options = { article: article(), artifactDirectory: directory, ...deps };
    const first = await runShadowVisualStages(options);
    await writeFile(path.join(directory, first.manifest.assets[0].artifact_path), "tampered");
    const repaired = await runShadowVisualStages(options);
    expect(repaired.reused_asset_ids).toHaveLength(3);
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(2);
    expect(deps.renderer.render).toHaveBeenCalledTimes(3);

    const missing = repaired.manifest.assets.find(({ request }) => request.kind === "hero");
    await unlink(path.join(directory, missing.artifact_path));
    const restored = await runShadowVisualStages(options);
    expect(restored.reused_asset_ids).toHaveLength(3);
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(2);
    expect(deps.renderer.render).toHaveBeenCalledTimes(4);

    deps.proseProvider.generate.mockResolvedValueOnce({ text: JSON.stringify({ inline: [{ body_locator: "## Review the evidence", purpose: "Show results", concept: "A factual analytics dashboard", alt: "Analytics dashboard showing measured campaign results", caption: "Claimed results." }] }) });
    await expect(runShadowVisualStages({ ...options, artifactDirectory: path.join(directory, "rejected") })).rejects.toThrow("prohibited factual chart");
  });
  it("recovers from malformed generated PNG output without repeating successful work", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-visuals-")); directories.push(directory);
    const deps = dependencies();
    const render = deps.renderer.render.getMockImplementation();
    deps.renderer.render.mockResolvedValueOnce({ bytes: Buffer.from("not a png"), mime_type: "image/png", renderer: { name: "mock-production-compositor", version: "1.0.0", library_versions: { mock: "1.0.0" } }, prompt_sha256: canonicalSha256("malformed") });
    const options = { article: article(), artifactDirectory: directory, ...deps };
    await expect(runShadowVisualStages(options)).rejects.toThrow("failed PNG validation");
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(1);

    deps.renderer.render.mockImplementation(render);
    const resumed = await runShadowVisualStages(options);
    expect(resumed.reused_asset_ids).toEqual([expect.stringMatching(/^inline-/u)]);
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(1);
    expect(deps.renderer.render).toHaveBeenCalledTimes(4);
  });

  it("invalidates cached plans and assets when the final profile changes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-visuals-")); directories.push(directory);
    const deps = dependencies();
    const initial = article();
    const first = await runShadowVisualStages({ article: initial, artifactDirectory: directory, ...deps });
    const changed = { ...initial, profile_version: "1.0.1", content_sha256: "" };
    changed.content_sha256 = canonicalArticleHash(changed);
    const rerun = await runShadowVisualStages({ article: changed, artifactDirectory: directory, ...deps });

    expect(rerun.reused_asset_ids).toEqual([]);
    expect(rerun.visual_plan_sha256).not.toBe(first.visual_plan_sha256);
    expect(deps.proseProvider.generate).toHaveBeenCalledTimes(2);
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(2);
    expect(deps.renderer.render).toHaveBeenCalledTimes(6);
    expect(rerun.manifest.assets.every(({ request }) => request.brand_profile_version === "1.0.1")).toBe(true);
    expect(rerun.manifest.assets.every(({ request }) => request.article_sha256 === changed.content_sha256)).toBe(true);
  });

  it("fails before image or renderer effects for model drift and malformed plans", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-visuals-")); directories.push(directory);
    const wrongModel = dependencies();
    wrongModel.imageProvider.model = "other-image-model";
    await expect(runShadowVisualStages({ article: article(), artifactDirectory: path.join(directory, "model"), ...wrongModel })).rejects.toThrow("gemini-3-pro-image");
    expect(wrongModel.imageProvider.generate).not.toHaveBeenCalled();
    expect(wrongModel.renderer.render).not.toHaveBeenCalled();

    const malformed = dependencies();
    malformed.proseProvider.generate.mockResolvedValueOnce({ text: "not json" });
    await expect(runShadowVisualStages({ article: article(), artifactDirectory: path.join(directory, "malformed"), ...malformed })).rejects.toThrow("invalid JSON");
    expect(malformed.imageProvider.generate).not.toHaveBeenCalled();
    expect(malformed.renderer.render).not.toHaveBeenCalled();
  });

  it("resumes completed stages after a renderer failure and rejects a changed article", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-visuals-")); directories.push(directory);
    const deps = dependencies();
    deps.renderer.render.mockRejectedValueOnce(new Error("renderer unavailable"));
    const options = { article: article(), artifactDirectory: directory, ...deps };
    await expect(runShadowVisualStages(options)).rejects.toThrow("renderer unavailable");
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(1);

    const resumed = await runShadowVisualStages(options);
    expect(resumed.reused_asset_ids).toEqual([expect.stringMatching(/^inline-/u)]);
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(1);
    expect(deps.renderer.render).toHaveBeenCalledTimes(4);
    for (const asset of resumed.manifest.assets) {
      await expect(readFile(path.join(directory, asset.artifact_path))).resolves.toHaveLength(asset.byte_length);
    }

    const changed = article();
    changed.body = "## A changed final heading\n\nThe final article changed.";
    changed.content_sha256 = canonicalArticleHash({ ...changed, content_sha256: "" });
    await expect(runShadowVisualStages({ ...options, article: changed })).rejects.toThrow("locator is not present in final article");
    expect(deps.imageProvider.generate).toHaveBeenCalledTimes(1);
  });

});
