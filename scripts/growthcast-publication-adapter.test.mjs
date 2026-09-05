import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalArticleHash,
  canonicalAssetManifestHash,
  canonicalPublicationBundleHash,
} from "@ejwhite/content-engine";
import { GrowthcastPublicationAdapter } from "./growthcast-publication-adapter.mjs";
import { createGrowthcastQueueRepository, loadPersistedBundleReadiness } from "./growthcast-content-store.mjs";

const roots = [];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "growthcast-publication-"));
  roots.push(root);
  const article = {
    schema_version: 1,
    content_id: "article-1",
    brief_id: "brief-1",
    brand: "growthcast",
    profile_version: "1.0.0",
    policy_versions: { editorial: "1.0.0" },
    title: "A deterministic article",
    description: "A deterministic article description.",
    slug: "deterministic-article",
    canonical_url: "https://growthcast.app/blog/deterministic-article",
    body: "## First section\n\nUseful copy.\n\n## Final section\n\nMore useful copy.",
    author: "Editor",
    published_at: "2026-09-05T12:00:00.000Z",
    modified_at: "2026-09-05T12:00:00.000Z",
    claims: [],
    internal_links: [],
    media_requirements: [],
    qa_report_path: "artifacts/qa.json",
    approval: null,
    content_sha256: "",
  };
  article.content_sha256 = canonicalArticleHash(article);
  const specs = [
    ["inline-1", "inline-illustration", "## First section", "inline"],
    ["hero-1", "hero", undefined, "hero"],
    ["og-1", "og", undefined, "og"],
  ];
  const assets = [];
  for (const [id, kind, body_locator, text] of specs) {
    const bytes = Buffer.from(`${text}-bytes`);
    const artifact_path = `${id}.png`;
    await mkdir(path.join(root, "artifacts"), { recursive: true });
    await writeFile(path.join(root, "artifacts", artifact_path), bytes);
    assets.push({
      schema_version: 1,
      request: {
        schema_version: 1, asset_id: id, content_id: article.content_id,
        article_sha256: article.content_sha256, brand: "growthcast", kind,
        purpose: `${kind} purpose`, concept: `${kind} concept`, body_locator,
        alt: `${kind} descriptive artwork`, caption: kind === "inline-illustration" ? "A useful caption" : undefined,
        width: kind === "og" ? 1200 : 800, height: kind === "og" ? 630 : 450,
        format: "png", prompt_template_version: "1.0.0", brand_profile_version: "1.0.0", seed: `${id}-seed`,
      },
      ...(kind === "inline-illustration"
        ? { provider: "google", model: "gemini-3-pro-image" }
        : { renderer: { name: "fixture", version: "1.0.0", library_versions: { fixture: "1.0.0" } } }),
      prompt_sha256: "a".repeat(64), source_article_sha256: article.content_sha256,
      binary_sha256: digest(bytes), mime_type: "image/png", width: kind === "og" ? 1200 : 800,
      height: kind === "og" ? 630 : 450, byte_length: bytes.length, artifact_path,
      generated_at: "2026-09-05T12:01:00.000Z", retry_count: 0,
    });
  }
  const unsigned = { schema_version: 1, manifest_id: "manifest-1", content_id: article.content_id, article_sha256: article.content_sha256, assets };
  const manifest = { ...unsigned, asset_manifest_sha256: canonicalAssetManifestHash(unsigned) };
  const publication_bundle_sha256 = canonicalPublicationBundleHash(article, manifest);
  const bundle = {
    schema_version: 1, bundle_id: "bundle-1", article, asset_manifest: manifest, publication_bundle_sha256,
    approval: { status: "approved", approved_by: "accountable-editor", approved_at: "2026-09-05T12:02:00.000Z", article_sha256: article.content_sha256, asset_manifest_sha256: manifest.asset_manifest_sha256, publication_bundle_sha256 },
  };
  return { root, bundle };
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("GrowthcastPublicationAdapter", () => {
  it("materializes deterministic Markdown and assets, publishes once, and verifies independent readback", async () => {
    const { root, bundle } = await fixture();
    const deploy = vi.fn(async ({ receiptPath }) => {
      const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
      expect(receipt).toMatchObject({
        status: "local-content-verified",
        article_slug: bundle.article.slug,
        publication_bundle_sha256: bundle.publication_bundle_sha256,
        deploy_triggered: false,
      });
    });
    const adapter = new GrowthcastPublicationAdapter({ root, deploy });
    const materialized = await adapter.materialize(bundle, { qaPassed: true });
    const source = await readFile(materialized.articleFile, "utf8");
    expect(source).toContain("![inline-illustration descriptive artwork](/blog/deterministic-article/inline-illustration-inline-1-");
    expect(source).toContain("image: \"/blog/deterministic-article/og-og-1-");
    expect(source).toContain("artwork: \"/blog/deterministic-article/hero-hero-1-");
    const published = await adapter.publish(bundle, materialized);
    await expect(adapter.readBack(bundle, published)).resolves.toMatchObject({ verified: true });
    await expect(readFile(published.receiptPath, "utf8")).resolves.toContain(bundle.publication_bundle_sha256);
    expect(deploy).toHaveBeenCalledTimes(1);
    await expect(adapter.publish(bundle, await adapter.materialize(bundle, { qaPassed: true }))).rejects.toThrow("refusing overwrite");
  });

  it("rejects forged, cross-adapter, and mutated materializations before side effects", async () => {
    const { root, bundle } = await fixture();
    const deploy = vi.fn(async () => {});
    const adapter = new GrowthcastPublicationAdapter({ root, deploy });
    await expect(adapter.publish(bundle, { publicDir: root, articleFile: root, references: {}, bundleHash: bundle.publication_bundle_sha256 })).rejects.toThrow("unsealed or mismatched materialization");
    const foreign = await new GrowthcastPublicationAdapter({ root }).materialize(bundle, { qaPassed: true });
    await expect(adapter.publish(bundle, foreign)).rejects.toThrow("unsealed or mismatched materialization");
    const materialized = await adapter.materialize(bundle, { qaPassed: true });
    materialized.bundleHash = "0".repeat(64);
    await expect(adapter.publish(bundle, materialized)).rejects.toThrow("unsealed or mismatched materialization");
    expect(deploy).not.toHaveBeenCalled();
  });

  it("fails closed before writes for shadow, missing assets, and changed article or asset approvals", async () => {
    const { root, bundle } = await fixture();
    const adapter = new GrowthcastPublicationAdapter({ root });
    await expect(adapter.materialize(bundle, { qaPassed: true, shadow: true })).rejects.toThrow("shadow mode cannot publish");
    const missing = structuredClone(bundle);
    missing.asset_manifest.assets = missing.asset_manifest.assets.filter((asset) => asset.request.kind !== "og");
    await expect(adapter.materialize(missing, { qaPassed: true })).rejects.toThrow("missing required og asset");
    const changedArticle = structuredClone(bundle);
    changedArticle.article.title = "Changed after approval";
    await expect(adapter.materialize(changedArticle, { qaPassed: true })).rejects.toThrow("article hash mismatch");
    const changedAsset = structuredClone(bundle);
    changedAsset.asset_manifest.assets[0].binary_sha256 = "f".repeat(64);
    await expect(adapter.materialize(changedAsset, { qaPassed: true })).rejects.toThrow("asset manifest hash mismatch");
    await expect(readFile(path.join(root, "src/content/blog/deterministic-article.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("completes exact readback and durable evidence before invoking deploy", async () => {
    const { root, bundle } = await fixture();
    let observedReceipt;
    const deploy = vi.fn(async ({ receiptPath }) => {
      observedReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
      const article = await readFile(path.join(root, "src", "content", "blog", `${bundle.article.slug}.md`));
      expect(digest(article)).toBe(observedReceipt.generated_article_file_sha256);
      for (const asset of bundle.asset_manifest.assets) {
        const name = `${asset.request.kind}-${asset.request.asset_id}-${asset.binary_sha256.slice(0, 12)}.png`;
        expect(digest(await readFile(path.join(root, "public", "blog", bundle.article.slug, name)))).toBe(asset.binary_sha256);
      }
    });
    const adapter = new GrowthcastPublicationAdapter({ root, deploy });
    await adapter.publish(bundle, await adapter.materialize(bundle, { qaPassed: true }));
    expect(observedReceipt).toMatchObject({ status: "local-content-verified", deploy_triggered: false });
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("preserves verified local state and blocks automatic retry when deploy outcome is uncertain", async () => {
    const { root, bundle } = await fixture();
    const deploy = vi.fn(async () => { throw new Error("connection reset after request"); });
    const adapter = new GrowthcastPublicationAdapter({ root, deploy });
    const materialized = await adapter.materialize(bundle, { qaPassed: true });
    let failure;
    try { await adapter.publish(bundle, materialized); } catch (error) { failure = error; }
    expect(failure).toMatchObject({
      message: "deploy outcome is unknown after local publication; manual reconciliation is required",
      published: { deploymentStatus: "unknown" },
      rollback: { deploymentStatus: "unknown", manualReconciliationRequired: true, overwritePerformed: false },
    });
    await expect(readFile(failure.published.articleTarget, "utf8")).resolves.toContain(bundle.publication_bundle_sha256);
    await expect(readFile(failure.published.receiptPath, "utf8")).resolves.toContain(bundle.publication_bundle_sha256);
    await expect(adapter.publish(bundle, await adapter.materialize(bundle, { qaPassed: true }))).rejects.toThrow("refusing overwrite");
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("reports storage failure and detects article and asset readback mismatches", async () => {
    const { root, bundle } = await fixture();
    const adapter = new GrowthcastPublicationAdapter({ root });
    await rm(path.join(root, "artifacts", bundle.asset_manifest.assets[0].artifact_path));
    await expect(adapter.materialize(bundle, { qaPassed: true })).rejects.toMatchObject({ code: "ENOENT" });

    const second = await fixture();
    const adapter2 = new GrowthcastPublicationAdapter({ root: second.root });
    const published = await adapter2.publish(second.bundle, await adapter2.materialize(second.bundle, { qaPassed: true }));
    const originalArticle = await readFile(published.articleTarget, "utf8");
    await writeFile(published.articleTarget, "tampered article");
    await expect(adapter2.readBack(second.bundle, published)).rejects.toThrow("article readback bytes do not match materialization");
    await writeFile(published.articleTarget, originalArticle);
    const hero = second.bundle.asset_manifest.assets.find((asset) => asset.request.kind === "hero");
    await writeFile(path.join(second.root, "public", published.references[hero.request.asset_id].path), "tampered asset");
    await expect(adapter2.readBack(second.bundle, published)).rejects.toThrow("readback mismatch for asset hero-1");
  });
});


describe("GrowthCast durable content state", () => {
  it("persists queue items across repository instances without duplicating identity", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "growthcast-queue-"));
    roots.push(root);
    const stateRoot = path.join(root, ".content-runs");
    const item = {
      schema_version: 1, queue_item_id: "queue-1", external_id: "external-1", brand: "growthcast",
      seed: { schema_version: 1, external_id: "external-1", brand: "growthcast", primary_keyword: "durable queue", status: "candidate" },
      state: "candidate", revision: 1, import_id: "import-1", source_sha256: "a".repeat(64),
      normalized_row_sha256: "b".repeat(64), created_at: "2026-09-05T00:00:00.000Z",
      updated_at: "2026-09-05T00:00:00.000Z", retry_count: 0, max_retries: 3, history: [{ at: "2026-09-05T00:00:00.000Z", actor: "operator", action: "imported", to_state: "candidate" }],
    };
    await createGrowthcastQueueRepository({ stateRoot }).put(item);
    await expect(createGrowthcastQueueRepository({ stateRoot }).get("queue-1")).resolves.toEqual(item);
    await expect(createGrowthcastQueueRepository({ stateRoot }).put({ ...item, queue_item_id: "queue-2" })).rejects.toThrow("queue identity already exists");
  });

  it("loads only complete persisted exact bundles and independently preflights artifact hashes", async () => {
    const { root, bundle } = await fixture();
    const records = path.join(root, ".content-runs", "publication-bundles");
    await mkdir(records, { recursive: true });
    await writeFile(path.join(records, `${bundle.article.slug}.json`), JSON.stringify({ schema_version: 1, qa_passed: true, bundle }));
    await expect(loadPersistedBundleReadiness(bundle.article.slug, { root })).resolves.toMatchObject({
      ready: true, qaPassed: true, articleSha256: bundle.article.content_sha256,
      assetManifestSha256: bundle.asset_manifest.asset_manifest_sha256,
      publicationBundleSha256: bundle.publication_bundle_sha256, approvedBy: "accountable-editor",
    });
    await writeFile(path.join(root, "artifacts", bundle.asset_manifest.assets[0].artifact_path), "changed");
    await expect(loadPersistedBundleReadiness(bundle.article.slug, { root })).resolves.toMatchObject({ ready: false });
    const borrowed = structuredClone(bundle);
    borrowed.article.slug = "different-article";
    await writeFile(path.join(records, "borrowed-approval.json"), JSON.stringify({ schema_version: 1, qa_passed: true, bundle: borrowed }));
    await expect(loadPersistedBundleReadiness("borrowed-approval", { root })).resolves.toEqual({
      ready: false, reasons: ["persisted publication bundle does not match requested slug"],
    });
    const wrongBrand = structuredClone(bundle);
    wrongBrand.article.slug = "wrong-brand";
    wrongBrand.article.brand = "verdant";
    await writeFile(path.join(records, "wrong-brand.json"), JSON.stringify({ schema_version: 1, qa_passed: true, bundle: wrongBrand }));
    await expect(loadPersistedBundleReadiness("wrong-brand", { root })).resolves.toEqual({
      ready: false, reasons: ["persisted publication bundle does not match GrowthCast"],
    });
    await expect(loadPersistedBundleReadiness("missing-bundle", { root })).resolves.toEqual({ ready: false, reasons: ["persisted publication bundle is missing"] });
  });
});


it("rejects traversal, absolute, directory, and symlink artifact paths before materialization", async () => {
  const { root, bundle } = await fixture();
  const adapter = new GrowthcastPublicationAdapter({ root });
  for (const artifactPath of ["../outside.png", path.join(root, "outside.png"), ".", "nested/../inline-1.png"]) {
    const changed = structuredClone(bundle); changed.asset_manifest.assets[0].artifact_path = artifactPath;
    changed.asset_manifest.asset_manifest_sha256 = canonicalAssetManifestHash(changed.asset_manifest);
    changed.publication_bundle_sha256 = canonicalPublicationBundleHash(changed.article, changed.asset_manifest);
    changed.approval.asset_manifest_sha256 = changed.asset_manifest.asset_manifest_sha256; changed.approval.publication_bundle_sha256 = changed.publication_bundle_sha256;
    await expect(adapter.materialize(changed, { qaPassed: true })).rejects.toThrow(/(?:unsafe artifact path|artifact path is unsafe)/);
  }
  await import("node:fs/promises").then(({ symlink }) => symlink(path.join(root, "artifacts", "inline-1.png"), path.join(root, "artifacts", "linked.png")));
  const linked = structuredClone(bundle); linked.asset_manifest.assets[0].artifact_path = "linked.png"; linked.asset_manifest.asset_manifest_sha256 = canonicalAssetManifestHash(linked.asset_manifest); linked.publication_bundle_sha256 = canonicalPublicationBundleHash(linked.article, linked.asset_manifest); linked.approval.asset_manifest_sha256 = linked.asset_manifest.asset_manifest_sha256; linked.approval.publication_bundle_sha256 = linked.publication_bundle_sha256;
  await expect(adapter.materialize(linked, { qaPassed: true })).rejects.toThrow("symbolic links are forbidden");
});
