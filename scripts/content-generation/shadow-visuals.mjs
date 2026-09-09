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

function normalizeHeadingLocator(value, locators) {
  const requested = value.trim();
  if (locators.includes(requested)) return requested;
  const headingText = requested.replace(/^#{1,6}\s+/u, "").trim();
  const matches = locators.filter((locator) => locator.replace(/^#{2,6}\s+/u, "").trim() === headingText);
  return matches.length === 1 ? matches[0] : requested;
}

function sectionExcerpt(body, locator) {
  const lines = body.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === locator);
  if (start < 0) return "";
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{2,6}\s+\S/u.test(line.trim())) break;
    if (line.trim()) section.push(line.trim());
  }
  return section.join(" ");
}

function normalizeInlineConcepts(items, locators, body) {
  return items.map((item) => ({
    body_locator: normalizeHeadingLocator(item.body_locator, locators),
    section_excerpt: sectionExcerpt(body, normalizeHeadingLocator(item.body_locator, locators)),
    purpose: item.purpose.trim(),
    concept: item.concept.trim(),
    alt: item.alt.trim(),
    caption: item.caption.trim(),
  }));
}

const VISUAL_PLAN_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "contextual_visual_plan",
    strict: true,
    schema: {
      type: "object",
      required: ["inline"],
      additionalProperties: false,
      properties: {
        inline: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            required: ["body_locator", "section_excerpt", "purpose", "concept", "alt", "caption"],
            additionalProperties: false,
            properties: Object.fromEntries(["body_locator", "section_excerpt", "purpose", "concept", "alt", "caption"].map((key) => [key, { type: "string" }])),
          },
        },
      },
    },
  },
};

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
    let generationError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const generated = await proseProvider.generate({
      system: [
        "Return only JSON for contextual editorial illustrations that materially improve comprehension.",
        "Use concrete, non-factual scenes with recognizable subjects, objects, settings, and actions that explain the adjacent section without numbers or purported observations.",
        "Never request or depict charts, graphs, UI, dashboards, screenshots, reports, metrics, benchmarks, customer outcomes, or claimed results.",
        "Do not introduce facts, labels inside the image, logos, trademarks, or photorealistic people.",
      ].join(" "),
      prompt: [
        "Return exactly {\"inline\":[...]}; include one to four useful illustrations at unique section headings and do not add another candidate array.",
        "Each item must contain only string fields body_locator, section_excerpt, purpose, concept, alt, and caption.",
        "Copy section_excerpt exactly from the text immediately following that heading in final_sections.",
        "Copy body_locator exactly from valid_body_locators (a unique heading text without Markdown marks is normalized back to that final heading).",
        "Purpose must explain the comprehension gain; concept must concretely name a recognizable subject, objects, setting, and action grounded in section_excerpt.",
        "In purpose and concept, do not use these words even to negate them: chart, graph, dashboard, screenshot, interface, UI, result, results, benchmark, metric, analytics, report.",
        "Alt must be 40 to 140 characters, independently describe the meaningful visual relationship for a screen-reader user, contain no filename or extension, and not say image/graphic; caption must explain the takeaway without asserting outcomes.",
      ].join(" "),
      input: { article_sha256: article.content_sha256, title: article.title, body: article.body, valid_body_locators: locators, final_sections: locators.map((heading) => ({ heading, excerpt: sectionExcerpt(article.body, heading) })) },
      maximumOutputTokens: 6000,
      responseFormat: VISUAL_PLAN_RESPONSE_FORMAT,
        });
        const raw = parsePlan(generated);
        const candidates = [];
        const required = ["body_locator", "section_excerpt", "purpose", "concept", "alt", "caption"];
        const visit = (value) => {
          if (Array.isArray(value)) {
            if (value.length > 0 && value.every((item) => item && typeof item === "object" && !Array.isArray(item) && required.every((key) => typeof item[key] === "string"))) candidates.push(value);
            return;
          }
          if (value && typeof value === "object") Object.values(value).forEach(visit);
        };
        visit(raw);
        if (candidates.length !== 1) throw new Error(`visual-plan response must contain exactly one structurally valid inline array; found ${candidates.length}`);
        plan = createVisualPlan(article, normalizeInlineConcepts(candidates[0], locators, article.body));
        generationError = undefined;
        break;
      } catch (error) {
        generationError = error;
      }
    }
    if (generationError) throw generationError;
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
