import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalSha256,
  certifyVisualProfile,
  loadProductionVisualProfile,
  renderHero,
  wrapTitle,
} from "@ejwhite/content-engine";
import opentype from "opentype.js";
import sharp from "sharp";

const BRAND = "growthcast";
const VERSION = "growthcast-production-v1";

function contentEngineAssetRoot() {
  const entry = fileURLToPath(import.meta.resolve("@ejwhite/content-engine"));
  return path.resolve(path.dirname(entry), "../visual-assets");
}

async function renderProductionOg(article, assetRoot) {
  const profile = loadProductionVisualProfile(BRAND, assetRoot);
  const fontAsset = profile.assets.find((asset) => asset.role === "font" && asset.family === "Manrope");
  const logoAsset = profile.assets.find((asset) => asset.role === "logo");
  if (!fontAsset || !logoAsset) throw new Error("certified GrowthCast font/logo binding is incomplete");

  const [fontBytes, logoBytes] = await Promise.all([
    readFile(path.join(assetRoot, fontAsset.path)),
    readFile(path.join(assetRoot, logoAsset.path)),
  ]);
  const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
  const titlePaths = wrapTitle(article.title, 25, 4)
    .map((line, index) => font.getPath(line, 86, 184 + index * 78, 64).toPathData(2))
    .map((pathData) => `<path d="${pathData}"/>`)
    .join("");
  const logo = `data:image/svg+xml;base64,${logoBytes.toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#141414"/><circle cx="1010" cy="155" r="185" fill="#74d890" opacity=".9"/><circle cx="1080" cy="350" r="125" fill="#6388ff" opacity=".55"/><g fill="#f7f5ef">${titlePaths}</g><image href="${logo}" x="820" y="492" width="310" height="92" preserveAspectRatio="xMidYMid meet"/></svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}

/** Certified local compositor: deterministic title-free hero/thumbnail and exact Manrope/title/logo OG. */
export function createGrowthCastProductionRenderer({ assetRoot = contentEngineAssetRoot() } = {}) {
  const certification = certifyVisualProfile(BRAND);
  if (!certification.productionReady) throw new Error(`uncertified ${BRAND} visual profile: ${certification.unresolvedAssets.join(", ")}`);
  loadProductionVisualProfile(BRAND, assetRoot);
  const ogCache = new Map();

  return {
    async render(request, article) {
      if (request.brand !== BRAND || article.brand !== BRAND) throw new Error("GrowthCast renderer rejects foreign brands");
      const input = { brand: BRAND, contentId: request.content_id, articleSha256: request.article_sha256, profileVersion: request.brand_profile_version, title: article.title };
      let bytes;
      if (request.kind === "og") {
        const cacheKey = canonicalSha256({ request, exact_title: article.title, renderer: VERSION });
        if (!ogCache.has(cacheKey)) ogCache.set(cacheKey, await renderProductionOg(article, assetRoot));
        bytes = Buffer.from(ogCache.get(cacheKey));
      } else {
        bytes = renderHero(input, request.kind === "thumbnail").bytes;
      }
      return {
        bytes,
        mime_type: "image/png",
        renderer: { name: "certified-growthcast-compositor", version: VERSION, library_versions: { sharp: sharp.versions.sharp, opentype: "1.3.4", content_engine: "0.1.0" } },
        prompt_sha256: canonicalSha256({ request, exact_title: request.kind === "og" ? article.title : null, renderer: VERSION }),
      };
    },
  };
}
