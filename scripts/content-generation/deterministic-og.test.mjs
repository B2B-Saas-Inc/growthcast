import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const executeDeterministicOg = vi.fn();
vi.mock("@ejwhite/content-engine", () => ({
  executeDeterministicOg,
  parseContract: vi.fn(async (_kind, value) => value),
  buildProductionOgDocument: vi.fn(),
  canonicalSha256: vi.fn(() => "a".repeat(64)),
  certifyVisualProfile: vi.fn(() => ({ productionReady: true, unresolvedAssets: [] })),
  loadProductionVisualProfile: vi.fn(),
  renderHero: vi.fn(),
}));
vi.mock("./production-renderer.mjs", () => ({
  createGrowthCastProductionRenderer: vi.fn(({ renderBrowserDocument }) => ({ renderBrowserDocument })),
}));

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); vi.clearAllMocks(); });

it("replaces only OG through a provider-free dependency surface", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "growthcast-og-"));
  roots.push(root);
  await mkdir(path.join(root, "assets"));
  await Promise.all([
    writeFile(path.join(root, "article.json"), JSON.stringify({ title: "Exact Canonical Title" })),
    writeFile(path.join(root, "asset-manifest.json"), JSON.stringify({ assets: [{ kind: "hero" }] })),
  ]);
  const capture = vi.fn();
  const manifest = { assets: [{ kind: "hero" }, { kind: "og" }], asset_manifest_sha256: "b".repeat(64) };
  const bundle = { approval: null, publication_bundle_sha256: "c".repeat(64) };
  executeDeterministicOg.mockResolvedValue({ manifest, bundle, reused_asset_ids: [], request_sha256s: [] });

  const { replaceDeterministicOg } = await import("./deterministic-og.mjs");
  await replaceDeterministicOg({ artifactDirectory: root, renderBrowserDocument: capture, now: () => new Date(0).toISOString() });

  expect(executeDeterministicOg).toHaveBeenCalledTimes(1);
  const dependencies = executeDeterministicOg.mock.calls[0][2];
  expect(Object.keys(dependencies).sort()).toEqual(["assetStore", "now", "renderer"]);
  expect(dependencies).not.toHaveProperty("imageProvider");
  expect(dependencies).not.toHaveProperty("proseProvider");
  expect(JSON.parse(await readFile(path.join(root, "asset-manifest.json"), "utf8"))).toEqual(manifest);
  expect(JSON.parse(await readFile(path.join(root, "publication-bundle.json"), "utf8"))).toEqual(bundle);
});

it("fails before reading artifacts without an injected network-disabled capture", async () => {
  const { replaceDeterministicOg } = await import("./deterministic-og.mjs");
  await expect(replaceDeterministicOg({ artifactDirectory: "/does/not/matter" })).rejects.toThrow("network-disabled browser capture adapter");
  expect(executeDeterministicOg).not.toHaveBeenCalled();
});
