#!/usr/bin/env node
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createQaReport, loadConfiguration, parseContract } from "@ejwhite/content-engine";
import { runDraftPipeline } from "./draft-pipeline.mjs";
import { OpenRouterProvider } from "./openrouter-provider.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

function usage() {
  return "Usage: npm run content:generate -- <approved-brief-id> [--run-id <id>] [--shadow] [--write-to-src] [--approval-file <path>]";
}

export function parseArguments(argv) {
  const options = { shadow: false, writeToSrc: false };
  const values = [...argv];
  while (values.length) {
    const value = values.shift();
    if (!value?.startsWith("--") && !options.briefId) options.briefId = value;
    else if (value === "--shadow") options.shadow = true;
    else if (value === "--write-to-src") options.writeToSrc = true;
    else if (["--run-id", "--approval-file"].includes(value)) {
      const next = values.shift();
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value`);
      options[value === "--run-id" ? "runId" : "approvalFile"] = next;
    } else throw new Error(`Unknown argument: ${value}\n${usage()}`);
  }
  if (!options.briefId) throw new Error(usage());
  if (options.shadow && options.writeToSrc) throw new Error("--shadow cannot be combined with --write-to-src");
  return options;
}

function frontmatterString(value) { return JSON.stringify(value); }

export function renderAstroDraft(article) {
  return `---\ntitle: ${frontmatterString(article.title)}\ndescription: ${frontmatterString(article.description)}\npublishedAt: ${article.published_at}\nauthor: ${frontmatterString(article.author)}\ntags: []\ndraft: true\n---\n\n${article.body.trim()}\n`;
}

async function applyApproval(result, approvalFile) {
  if (!approvalFile) return result;
  const approval = JSON.parse(await readFile(path.resolve(approvalFile), "utf8"));
  const article = { ...result.article, approval };
  await parseContract("article", article);
  if (approval.content_sha256 !== article.content_sha256) throw new Error("approval content hash does not match generated article");
  const { profiles } = await loadConfiguration();
  const qa = createQaReport(article, result.evidence, profiles.growthcast, { generatedAt: new Date(0).toISOString() });
  await parseContract("qa-report", qa);
  await Promise.all([
    writeFile(path.join(result.artifactDirectory, "article.json"), `${JSON.stringify(article, null, 2)}\n`, { mode: 0o600 }),
    writeFile(path.join(result.artifactDirectory, "qa-report.json"), `${JSON.stringify(qa, null, 2)}\n`, { mode: 0o600 }),
  ]);
  return { ...result, article, qa };
}

async function writeSourceDraft(article, root) {
  const blog = path.join(root, "src/content/blog");
  const target = path.resolve(blog, `${article.slug}.md`);
  if (path.dirname(target) !== blog) throw new Error("generated slug escapes the Astro blog directory");
  await mkdir(blog, { recursive: true });
  try { await writeFile(target, renderAstroDraft(article), { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error?.code === "EEXIST") throw new Error(`refusing to overwrite existing source: ${path.relative(root, target)}`, { cause: error }); throw error; }
  return target;
}

export async function runCli(argv, { root = ROOT, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const options = parseArguments(argv);
  const briefFile = path.join(root, "docs/content-briefs/contracts", `${options.briefId}.json`);
  await access(briefFile, constants.R_OK);
  const brief = JSON.parse(await readFile(briefFile, "utf8"));
  const runId = options.runId || `${options.briefId}-draft`;
  const artifactRoot = path.join(root, "artifacts/content-generation", options.shadow ? "shadow" : "runs");
  const checkpointRoot = path.join(root, "artifacts/content-generation/checkpoints");
  const provider = new OpenRouterProvider({ env, fetchImpl });
  let result = await runDraftPipeline({ brief, provider, runId, artifactDirectory: artifactRoot, checkpointDirectory: checkpointRoot });
  result = await applyApproval(result, options.approvalFile);
  const sourcePath = options.writeToSrc ? await writeSourceDraft(result.article, root) : null;
  return {
    mode: options.shadow ? "shadow" : "review",
    run_id: runId,
    content_sha256: result.article.content_sha256,
    approval_matches: result.article.approval?.content_sha256 === result.article.content_sha256,
    artifact_directory: path.relative(root, result.artifactDirectory),
    source_written: sourcePath ? path.relative(root, sourcePath) : null,
    publication_requested: false,
    deploy_hook_invoked: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) runCli(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
