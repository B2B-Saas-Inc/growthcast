import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import {
  loadConfiguration,
  migrateGrowthCast,
  parseContract,
  validateBrief,
} from "@ejwhite/content-engine";

const sourceDirectory = new URL("../docs/content-briefs/", import.meta.url);
const outputDirectory = new URL("../docs/content-briefs/contracts/", import.meta.url);
const checkOnly = process.argv.includes("--check");
const migrationTimestamp = "2026-09-04T00:00:00.000Z";

const field = (source, label) =>
  source.match(new RegExp(`^- ${label}:\\s*(.+)$`, "mi"))?.[1]?.trim();
const inlineCode = (value) => value?.replace(/^`|`$/g, "");
const splitList = (value) => value?.split(/;\s*/).map((item) => item.trim()).filter(Boolean) ?? [];

function normalizeLegacyBrief(source, filename) {
  const detailed = filename === "ai-sales-automation-for-startups.md";
  const title = detailed
    ? source.match(/^- Proposed title:\s*(.+)$/mi)?.[1]?.trim()
    : source.match(/^# Content Brief:\s*(.+)$/m)?.[1]?.trim();
  const slug = inlineCode(field(source, "Slug")) ?? filename.replace(/\.md$/, "");
  const keyword = field(source, "Primary keyword") ?? source.match(/^- Primary keyword:\s*(.+)$/mi)?.[1]?.trim();
  const audience = field(source, "Audience");
  const readerProblem = field(source, "Reader problem");
  const promise = field(source, "Promise") ?? source.match(/^Promise:\s*(.+)$/mi)?.[1]?.trim();
  const description = field(source, "Meta description");
  const outlineText = field(source, "Outline");
  const outline = outlineText
    ? splitList(outlineText)
    : [...source.matchAll(/^\| ([^|]+) \| ([^|]+) \|[^\n]+$/gm)]
        .slice(1)
        .map((match) => `${match[1].trim()}: ${match[2].trim()}`);

  if (![title, keyword, audience, readerProblem, promise, description].every(Boolean)) {
    throw new Error(`${filename}: legacy summary is missing a required migration field`);
  }

  return {
    title,
    slug,
    keyword,
    audience,
    description: promise,
    angle: promise,
    author: "EJ White",
    internal_links: ["/why-growthcast", "/how-it-works", "/company/partners", "/resources/tools/forecast", "/?contact=1"],
    scheduled_at: field(source, "Scheduled publication")?.replace(/\s+\(America\/New_York\)$/, ""),
    readerProblem,
    metaDescription: description,
    outline,
    externalSources: [...new Set([...source.matchAll(/https?:\/\/[^\s;|]+/g)].map((match) => match[0]))],
    risk: field(source, "Risks") ?? "Do not make unsupported performance, ranking, pricing, or product claims.",
  };
}

function createContract(source, filename) {
  const legacy = normalizeLegacyBrief(source, filename);
  const migration = migrateGrowthCast(legacy, migrationTimestamp);
  if (!migration.brief || migration.issues.some((issue) => issue.severity === "error")) {
    throw new Error(`${filename}: migration failed: ${JSON.stringify(migration.issues)}`);
  }

  return {
    ...migration.brief,
    reader: { role: legacy.audience, task: legacy.readerProblem },
    intent: {
      type: "compare",
      primary_query: legacy.keyword,
      direct_answer: legacy.description,
    },
    angle: {
      thesis: legacy.description,
      non_obvious_point: legacy.angle,
      boundaries: [legacy.risk],
    },
    outline: legacy.outline.map((item) => {
      const [heading, ...question] = item.split(":");
      return { heading: heading.trim(), questions: [question.join(":").trim() || legacy.readerProblem] };
    }),
    internal_link_targets: migration.brief.internal_link_targets.map((link) => ({
      ...link,
      purpose: link.url === "/?contact=1" ? "GrowthCast contact conversion" : "Relevant GrowthCast context",
    })),
    source_plan: legacy.externalSources.map((url, index) => ({
      claim_id: `planned-source-${index + 1}`,
      source_type: `authoritative-web-source:${url}`,
      required: true,
    })),
    conversion: { action: "Start a GrowthCast conversation", destination: "/?contact=1" },
    publishing: {
      ...migration.brief.publishing,
      ...(legacy.scheduled_at ? { scheduled_at: legacy.scheduled_at } : {}),
    },
  };
}

const configuration = await loadConfiguration();
const profile = configuration.profiles.growthcast;
const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith(".md")).sort();
const failures = [];

if (!checkOnly) await mkdir(outputDirectory, { recursive: true });
for (const file of files) {
  try {
    const source = await readFile(new URL(file, sourceDirectory), "utf8");
    const contract = await parseContract("brief", createContract(source, file));
    const findings = validateBrief(contract, profile).filter(
      (finding) => finding.severity === "error" && finding.message !== "Accountable approval is required.",
    );
    if (findings.length) throw new Error(findings.map((finding) => finding.message).join("; "));
    const serialized = `${JSON.stringify(contract, null, 2)}\n`;
    const destination = new URL(file.replace(/\.md$/, ".json"), outputDirectory);
    if (checkOnly) {
      const existing = await readFile(destination, "utf8").catch(() => "");
      if (existing !== serialized) failures.push(`${file}: contract is missing or stale`);
    } else {
      await writeFile(destination, serialized);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length) {
  console.error(`Content brief migration validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${checkOnly ? "Validated" : "Migrated"} ${files.length} GrowthCast content briefs against the shared contract.`);
