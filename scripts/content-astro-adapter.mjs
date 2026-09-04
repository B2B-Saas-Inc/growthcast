import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalArticleHash,
  createQaReport,
  loadConfiguration,
  parseContract,
} from "@ejwhite/content-engine";

const ROOT = path.resolve(import.meta.dirname, "..");
const BLOG_DIR = path.join(ROOT, "src/content/blog");
const BRIEF_DIR = path.join(ROOT, "docs/content-briefs/contracts");
const APPROVAL_DIR = path.join(ROOT, "docs/content-approvals");
const SITE = "https://growthcast.app";
const policies = {
  "universal-editorial": "1.0.0",
  evidence: "1.0.0",
  "search-discoverability": "1.0.0",
};

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

export function parseAstroMarkdown(source, file) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u);
  if (!match) throw new Error(`${file}: missing frontmatter`);
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const pair = line.match(/^([A-Za-z][\w]*):\s*(.*)$/u);
    if (!pair) throw new Error(`${file}: unsupported frontmatter line ${JSON.stringify(line)}`);
    frontmatter[pair[1]] = parseScalar(pair[2]);
  }
  return { frontmatter, body: match[2].trim() };
}

const isoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid publication date: ${value}`);
  return date.toISOString();
};

async function optionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

export async function inventory() {
  const files = (await readdir(BLOG_DIR)).filter((file) => /\.mdx?$/u.test(file)).sort();
  return Promise.all(files.map(async (file) => {
    const slug = file.replace(/\.mdx?$/u, "");
    const { frontmatter } = parseAstroMarkdown(await readFile(path.join(BLOG_DIR, file), "utf8"), file);
    return {
      content_id: slug,
      slug,
      source_path: path.posix.join("src/content/blog", file),
      canonical_url: `${SITE}/blog/${slug}`,
      title: frontmatter.title,
      published_at: isoDate(frontmatter.publishedAt),
      draft: frontmatter.draft === true,
      indexable: frontmatter.draft !== true,
    };
  }));
}

function extractInternalLinks(body, knownUrls) {
  return [...body.matchAll(/\[([^\n[]+)\]\((\/[^)\s]+)\)/gu)].map((match) => ({
    anchor: match[1], url: match[2], inventory_verified: knownUrls.has(match[2].split("?")[0].replace(/\/$/u, "") || "/"),
  }));
}

function brandFindings(article) {
  const findings = [];
  const add = (rule, message, excerpt) => findings.push({ rule_id: rule, message, excerpt });
  if (article.body.includes("—")) add("growthcast.no-em-dash", "Body contains an em dash.", "—");
  if (article.body.includes("--")) add("growthcast.no-double-hyphen", "Body contains a double hyphen.", "--");
  for (const phrase of ["furthermore", "moreover", "in addition", "it is worth noting", "in conclusion", "to summarize", "it is important to note", "this approach enables"]) {
    if (article.body.toLowerCase().includes(phrase)) add("growthcast.no-stock-transition", `Body contains prohibited stock phrase “${phrase}”.`, phrase);
  }
  const last = article.body.trim().split(/\n\s*\n/u).at(-1) ?? "";
  if (!last.includes("](/?contact=1)")) add("growthcast.cta", "Final paragraph must use the approved GrowthCast conversation destination.", last.slice(0, 240));
  for (const link of article.internal_links) if (!link.inventory_verified) add("search.internal-link-inventory", `Internal link is absent from the Astro inventory: ${link.url}`, link.anchor);
  return findings;
}

export async function loadArticle(slug) {
  const siteInventory = await inventory();
  const item = siteInventory.find((candidate) => candidate.slug === slug);
  if (!item) throw new Error(`Unknown blog slug: ${slug}`);
  const source = await readFile(path.join(ROOT, item.source_path), "utf8");
  const { frontmatter, body } = parseAstroMarkdown(source, item.source_path);
  const knownUrls = new Set(["/", "/blog", "/why-growthcast", "/how-it-works", "/resources/tools/forecast", "/company/partners", ...siteInventory.map((entry) => `/blog/${entry.slug}`)]);
  const approval = await optionalJson(path.join(APPROVAL_DIR, `${slug}.json`));
  const article = {
    schema_version: 1, content_id: slug, brief_id: slug, brand: "growthcast", profile_version: "1.0.0", policy_versions: policies,
    title: frontmatter.title, description: frontmatter.description, slug, canonical_url: item.canonical_url, body,
    author: frontmatter.author ?? "EJ White", published_at: isoDate(frontmatter.publishedAt), modified_at: isoDate(frontmatter.updatedAt ?? frontmatter.publishedAt),
    claims: [], internal_links: extractInternalLinks(body, knownUrls), media_requirements: [], qa_report_path: `artifacts/content/${slug}/qa-report.json`,
    approval, content_sha256: "",
  };
  article.content_sha256 = canonicalArticleHash(article);
  await parseContract("article", article);
  return article;
}

export async function validateSlug(slug) {
  const article = await loadArticle(slug);
  const { profiles } = await loadConfiguration();
  const report = createQaReport(article, { schema_version: 1, brief_id: slug, records: [] }, profiles.growthcast, { generatedAt: new Date(0).toISOString() });
  return { article, report, brand_findings: brandFindings(article) };
}

export function assessPublicationReadiness(article, report, local = []) {
  const reasons = [];
  if (report.result !== "pass") reasons.push("shared QA report does not pass");
  if (local.length > 0) reasons.push("GrowthCast profile validation does not pass");
  if (!article.approval) reasons.push("exact-hash approval is missing");
  else if (article.approval.content_sha256 !== article.content_sha256) reasons.push("approval content hash does not match article");
  return { article, report, brand_findings: local, ready: reasons.length === 0, reasons };
}

export async function publicationReadiness(slug) {
  const { article, report, brand_findings: local } = await validateSlug(slug);
  return assessPublicationReadiness(article, report, local);
}

async function command() {
  const [action, target] = process.argv.slice(2);
  if (action === "inventory") {
    console.log(JSON.stringify({ schema_version: 1, site: SITE, articles: await inventory() }, null, 2));
    return;
  }
  if (action === "draft") {
    if (!target) throw new Error("Usage: content:astro draft <brief-id>");
    const brief = await parseContract("brief", JSON.parse(await readFile(path.join(BRIEF_DIR, `${target}.json`), "utf8")));
    if (brief.status !== "approved" || brief.approval === null) throw new Error(`${target}: drafting blocked until the brief has accountable approval`);
    console.log(JSON.stringify({ dry_run: true, would_write: `src/content/blog/${brief.publishing.slug}.md`, brief_id: target, title_intent: brief.intent.primary_query, publication_requested: false }, null, 2));
    return;
  }
  const slugs = target ? [target] : (await inventory()).map((item) => item.slug);
  let failed = false;
  for (const slug of slugs) {
    const readiness = await publicationReadiness(slug);
    const { article, report, brand_findings: local } = readiness;
    const approvalFindings = report.findings.filter((finding) => finding.rule_id === "editorial.exact-hash-approval");
    const nonApprovalFindings = report.findings.filter((finding) => finding.class !== "advisory" && finding.rule_id !== "editorial.exact-hash-approval");
    const validQa = report.result !== "fail" || (approvalFindings.length === 1 && nonApprovalFindings.length === 0);
    console.log(JSON.stringify({ slug, content_sha256: article.content_sha256, qa_valid_except_approval: validQa && local.length === 0, approval_matches: article.approval?.content_sha256 === article.content_sha256, preflight_ready: readiness.ready, preflight_reasons: readiness.reasons, shared_findings: report.findings, brand_findings: local }, null, 2));
    if (action === "preflight" ? !readiness.ready : !validQa || local.length > 0) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) command().catch((error) => { console.error(error.message); process.exitCode = 1; });
