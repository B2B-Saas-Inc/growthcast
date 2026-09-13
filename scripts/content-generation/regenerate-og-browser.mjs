import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "/opt/pi-playwright/node_modules/playwright/index.mjs";
import { replaceDeterministicOg } from "./deterministic-og.mjs";

const directory = process.argv[2];
if (!directory) throw new TypeError("usage: node regenerate-og-browser.mjs <artifact-directory>");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
let externalRequests = 0;
const browser = await chromium.launch({ headless: true });
try {
  const result = await replaceDeterministicOg({
    artifactDirectory: directory,
    now: () => "1970-01-01T00:00:00.000Z",
    async renderBrowserDocument(document, { assetRoot, request }) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
      const heroPath = path.resolve(directory, request.og_render_binding.hero.artifact_path);
      const hero = await readFile(heroPath);
      if (digest(hero) !== request.og_render_binding.hero.binary_sha256) throw new Error("hero bytes do not match bound SHA-256");
      const bound = new Map();
      for (const asset of [...document.fontAssets, ...(document.logoAsset ? [document.logoAsset] : [])]) {
        const bytes = await readFile(path.resolve(assetRoot, asset.filename));
        if (digest(bytes) !== asset.sha256) throw new Error(`profile asset bytes do not match bound SHA-256: ${asset.filename}`);
        bound.set(asset.filename, bytes);
      }
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "render-input.test") {
          if (decodeURIComponent(url.pathname.slice(1)) !== document.heroAsset.filename) throw new Error("hero path drift");
          return route.fulfill({ status: 200, contentType: "image/png", body: hero });
        }
        if (url.hostname === "visual-assets.test") {
          const filename = decodeURIComponent(url.pathname).replace(/^\/growthcast\//u, "").replace(/^\//u, "");
          const body = bound.get(filename) ?? bound.get(`growthcast/${filename}`);
          if (!body) throw new Error(`unbound profile asset request: ${filename}`);
          return route.fulfill({ status: 200, contentType: filename.endsWith(".svg") ? "image/svg+xml" : "font/ttf", body });
        }
        if (url.protocol !== "about:" && url.protocol !== "data:") externalRequests += 1;
        return route.abort("blockedbyclient");
      });
      await page.setContent(document.html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const proof = await page.evaluate(({ title, author, date, safe }) => {
        const nodes = [document.querySelector(".title"), document.querySelector(".hero"), document.querySelector(".author"), document.querySelector(".date")];
        if (nodes.some((node) => !node)) return { valid: false };
        const boxes = nodes.map((node) => node.getBoundingClientRect());
        return {
          valid: nodes[0].textContent === title && document.body.textContent.includes(author) && document.body.textContent.includes(date),
          safe: boxes.every((box) => box.x >= safe.x && box.y >= safe.y && box.right <= safe.x + safe.width && box.bottom <= safe.y + safe.height),
          unclipped: nodes.every((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight),
          hero: nodes[1].complete && nodes[1].naturalWidth > 0,
          fonts: [...document.fonts].map((font) => font.status),
        };
      }, { title: request.og_render_binding.canonical_title, author: request.og_render_binding.author, date: request.og_render_binding.formatted_publish_date, safe: document.safeZone });
      if (!proof.valid || !proof.safe || !proof.unclipped || !proof.hero || proof.fonts.some((status) => status !== "loaded")) throw new Error(`browser OG proof failed: ${JSON.stringify(proof)}`);
      const bytes = await page.screenshot({ type: "png", animations: "disabled" });
      await page.close();
      return bytes;
    },
  });
  if (externalRequests !== 0) throw new Error(`renderer attempted ${externalRequests} external requests`);
  console.log(JSON.stringify({ assetManifestSha256: result.manifest.asset_manifest_sha256, publicationBundleSha256: result.bundle.publication_bundle_sha256, og: result.manifest.assets.find((asset) => asset.request.kind === "og"), externalRequests }, null, 2));
} finally {
  await browser.close();
}
