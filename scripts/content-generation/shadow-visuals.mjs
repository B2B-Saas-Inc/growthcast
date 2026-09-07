import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalSha256,
  createVisualPlan,
  executeShadowVisuals,
  validateVisualPlan,
} from "@ejwhite/content-engine";

function safeHash(value) {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("request hash must be lowercase SHA-256");
  return value;
}

async function atomicWrite(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Local-only content-addressed storage. Corrupt or incomplete entries are cache misses. */
export class FilesystemShadowAssetStore {
  constructor(directory) { this.directory = path.resolve(directory); }
  async load(requestHash) {
    const stem = path.join(this.directory, safeHash(requestHash));
    try {
      const metadata = JSON.parse(await readFile(`${stem}.json`, "utf8"));
      const assetFile = path.join(this.directory, path.basename(metadata.artifact_path));
      const bytes = await readFile(assetFile);
      const binaryHash = createHash("sha256").update(bytes).digest("hex");
      if (binaryHash !== metadata.binary_sha256 || bytes.byteLength !== metadata.byte_length) return undefined;
      return metadata;
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }
  async save(requestHash, asset, bytes) {
    const stem = path.join(this.directory, safeHash(requestHash));
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const assetFile = path.join(this.directory, path.basename(asset.artifact_path));
    await atomicWrite(assetFile, bytes);
    await atomicWrite(`${stem}.json`, `${JSON.stringify(asset, null, 2)}\n`);
  }
}

function parsePlan(result) {
  const source = result.text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  try { return JSON.parse(source); }
  catch (error) { throw new Error("visual-plan returned invalid JSON", { cause: error }); }
}

/** Runs approval-stopped visuals after the final article exists. All effectful components are injected. */
export async function runShadowVisualStages({ article, proseProvider, imageProvider, renderer, artifactDirectory, now }) {
  const locators = article.body.split(/\r?\n/u).map((line) => line.trim()).filter((line) => /^#{2,6}\s+\S/u.test(line));
  const planFile = path.join(path.resolve(artifactDirectory), "visual-plan.json");
  let plan;
  try {
    const cached = JSON.parse(await readFile(planFile, "utf8"));
    if (validateVisualPlan(article, cached).length === 0) plan = cached;
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  if (!plan) {
    const generated = await proseProvider.generate({
      system: "Return only JSON. Plan contextual editorial illustrations; never charts, UI, dashboards, screenshots, metrics, benchmarks, or claimed results.",
      prompt: "Return an object with an inline array. Each item requires body_locator, purpose, concept, accessible alt, and caption.",
      input: { article_sha256: article.content_sha256, title: article.title, body: article.body, valid_body_locators: locators },
      maximumOutputTokens: 2000,
    });
    const raw = parsePlan(generated);
    const candidates = [];
    const required = ["body_locator", "purpose", "concept", "alt", "caption"];
    const visit = (value) => {
      if (Array.isArray(value)) {
        if (value.length > 0 && value.every((item) => item && typeof item === "object" && !Array.isArray(item) && required.every((key) => typeof item[key] === "string"))) candidates.push(value);
        return;
      }
      if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(raw);
    if (candidates.length !== 1) throw new Error(`visual-plan response must contain exactly one structurally valid inline array; found ${candidates.length}`);
    plan = createVisualPlan(article, candidates[0]);
    const findings = validateVisualPlan(article, plan);
    if (findings.length > 0) throw new Error(findings.map((finding) => finding.message).join("; "));
    await atomicWrite(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  }
  const assetDirectory = path.join(path.resolve(artifactDirectory), "assets");
  const result = await executeShadowVisuals(article, plan, {
    imageProvider,
    renderer,
    assetStore: new FilesystemShadowAssetStore(assetDirectory),
    now,
  });
  await Promise.all([
    atomicWrite(path.join(artifactDirectory, "asset-manifest.json"), `${JSON.stringify(result.manifest, null, 2)}\n`),
    atomicWrite(path.join(artifactDirectory, "publication-bundle.json"), `${JSON.stringify(result.bundle, null, 2)}\n`),
  ]);
  return { ...result, visual_plan_sha256: canonicalSha256(plan) };
}
