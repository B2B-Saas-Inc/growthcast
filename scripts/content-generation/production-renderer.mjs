import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProductionOgDocument,
  canonicalSha256,
  certifyVisualProfile,
  loadProductionVisualProfile,
  renderHero,
} from "@ejwhite/content-engine";

const BRAND = "growthcast";
const VERSION = "growthcast-social-v1";

function contentEngineAssetRoot() {
  const entry = fileURLToPath(import.meta.resolve("@ejwhite/content-engine"));
  return path.resolve(path.dirname(entry), "../visual-assets");
}

function sharedRenderRequest(request, article) {
  if (!request.og_render_binding) throw new Error("GrowthCast OG requires render binding v2");
  return {
    brand: request.brand,
    contentId: request.content_id,
    articleSha256: request.article_sha256,
    profileVersion: request.brand_profile_version,
    title: article.title,
    ogRenderBinding: request.og_render_binding,
  };
}

/**
 * Certified GrowthCast compositor. OG rendering is delegated exclusively to the
 * shared, versioned GrowthCast social-v1 browser document. The injected browser
 * capture must fulfill only its hash-bound local hero/font/logo assets.
 */
export function createGrowthCastProductionRenderer({
  assetRoot = contentEngineAssetRoot(),
  renderBrowserDocument,
} = {}) {
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
        if (typeof renderBrowserDocument !== "function") throw new Error("GrowthCast OG requires the network-disabled browser capture adapter");
        const renderRequest = sharedRenderRequest(request, article);
        const document = buildProductionOgDocument(renderRequest);
        const cacheKey = canonicalSha256({ request, document: { brand: document.brand, title: document.title, hero: document.heroAsset, fonts: document.fontAssets, logo: document.logoAsset, safe_zone: document.safeZone }, renderer: VERSION });
        if (!ogCache.has(cacheKey)) ogCache.set(cacheKey, await renderBrowserDocument(document, { assetRoot, request, article }));
        bytes = Buffer.from(ogCache.get(cacheKey));
      } else {
        bytes = renderHero(input, request.kind === "thumbnail").bytes;
      }
      return {
        bytes,
        mime_type: "image/png",
        renderer: { name: "shared-growthcast-brand-native-browser-compositor", version: VERSION, library_versions: { content_engine: "0.1.0" } },
        prompt_sha256: canonicalSha256({ request, exact_title: request.kind === "og" ? article.title : null, renderer: VERSION }),
      };
    },
  };
}
