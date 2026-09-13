import { readFile } from "node:fs/promises";
import path from "node:path";
import { executeDeterministicOg, parseContract } from "@ejwhite/content-engine";
import { createGrowthCastProductionRenderer } from "./production-renderer.mjs";
import { atomicWrite, FilesystemShadowAssetStore } from "./shadow-visuals.mjs";

/**
 * Provider-free GrowthCast OG replacement. This module deliberately imports no
 * prose/image provider and its dependency surface accepts only browser capture.
 */
export async function replaceDeterministicOg({ artifactDirectory, renderBrowserDocument, now }) {
  if (typeof renderBrowserDocument !== "function") throw new TypeError("network-disabled browser capture adapter is required");
  const directory = path.resolve(artifactDirectory);
  const [articleSource, manifestSource] = await Promise.all([
    readFile(path.join(directory, "article.json"), "utf8"),
    readFile(path.join(directory, "asset-manifest.json"), "utf8"),
  ]);
  const article = await parseContract("article", JSON.parse(articleSource));
  const manifest = await parseContract("asset-manifest", JSON.parse(manifestSource));
  const result = await executeDeterministicOg(article, manifest, {
    renderer: createGrowthCastProductionRenderer({ renderBrowserDocument }),
    assetStore: new FilesystemShadowAssetStore(path.join(directory, "assets")),
    now,
  });
  await Promise.all([
    atomicWrite(path.join(directory, "asset-manifest.json"), `${JSON.stringify(result.manifest, null, 2)}\n`),
    atomicWrite(path.join(directory, "publication-bundle.json"), `${JSON.stringify(result.bundle, null, 2)}\n`),
  ]);
  return { ...result, artifactDirectory: directory };
}
