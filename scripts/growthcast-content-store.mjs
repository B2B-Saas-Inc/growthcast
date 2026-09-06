import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { AtomicFileQueueRepository } from "@ejwhite/content-engine";
import { GrowthcastPublicationAdapter } from "./growthcast-publication-adapter.mjs";

export const DEFAULT_CONTENT_STATE_ROOT = path.resolve(".content-runs");

function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Durable, process-safe local queue. State is intentionally ignored, while this path/configuration is checked in. */
export function createGrowthcastQueueRepository({ stateRoot = DEFAULT_CONTENT_STATE_ROOT, lockTimeoutMs } = {}) {
  const root = path.resolve(stateRoot);
  return new AtomicFileQueueRepository(path.join(root, "queue", "queue-v1.json"), { lockTimeoutMs });
}

/**
 * Load a locally persisted, exact publication bundle for scheduler preflight.
 * The record is written by an accountable offline workflow and never by this loader.
 */
export async function loadPersistedBundleReadiness(slug, {
  root = process.cwd(),
  stateRoot = path.join(root, ".content-runs"),
} = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) return { ready: false, reasons: ["invalid publication bundle slug"] };
  const recordsRoot = path.resolve(stateRoot, "publication-bundles");
  const recordPath = path.resolve(recordsRoot, `${slug}.json`);
  if (!within(recordsRoot, recordPath)) return { ready: false, reasons: ["publication bundle path escapes state root"] };
  try {
    const info = await lstat(recordPath);
    if (!info.isFile() || info.isSymbolicLink()) return { ready: false, reasons: ["publication bundle record must be a regular file"] };
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    if (record?.schema_version !== 1 || record?.qa_passed !== true || !record?.bundle)
      return { ready: false, reasons: ["persisted publication bundle record is incomplete"] };
    if (record.bundle.article?.slug !== slug)
      return { ready: false, reasons: ["persisted publication bundle does not match requested slug"] };
    if (record.bundle.article?.brand !== "growthcast")
      return { ready: false, reasons: ["persisted publication bundle does not match GrowthCast"] };
    let canonicalUrl;
    try { canonicalUrl = new URL(record.bundle.article?.canonical_url); }
    catch { return { ready: false, reasons: ["persisted publication bundle has an invalid canonical URL"] }; }
    if (canonicalUrl.origin !== "https://growthcast.app" || canonicalUrl.pathname !== `/blog/${slug}` || canonicalUrl.search || canonicalUrl.hash)
      return { ready: false, reasons: ["persisted publication bundle canonical URL does not match requested slug"] };
    const adapter = new GrowthcastPublicationAdapter({ root });
    const readiness = await adapter.preflight(record.bundle, { qaPassed: true, shadow: false });
    return { ...readiness, articleSlug: record.bundle.article.slug, brand: record.bundle.article.brand };
  } catch (error) {
    if (error?.code === "ENOENT") return { ready: false, reasons: ["persisted publication bundle is missing"] };
    if (error instanceof SyntaxError) return { ready: false, reasons: ["persisted publication bundle is invalid JSON"] };
    return { ready: false, reasons: [error instanceof Error ? error.message : "persisted publication bundle could not be read"] };
  }
}
