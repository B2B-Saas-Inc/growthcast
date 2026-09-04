import { readdir, readFile } from "node:fs/promises";
import { publicationReadiness } from "./content-astro-adapter.mjs";

const contentDirectory = new URL("../src/content/blog/", import.meta.url);

export async function findDuePosts({ now = Date.now(), directory = contentDirectory } = {}) {
  const duePosts = [];
  for (const file of await readdir(directory)) {
    if (!/\.mdx?$/u.test(file)) continue;
    const source = await readFile(new URL(file, directory), "utf8");
    const publishedAt = source.match(/^publishedAt:\s*(.+)$/mu)?.[1]?.trim();
    const draft = source.match(/^draft:\s*(.+)$/mu)?.[1]?.trim() === "true";
    if (!publishedAt || draft || Date.parse(publishedAt) > now) continue;
    duePosts.push(file.replace(/\.mdx?$/u, ""));
  }
  return duePosts.sort();
}

export async function runScheduledPublishing({
  fetchImpl = fetch,
  getDuePosts = findDuePosts,
  getReadiness = publicationReadiness,
  getDeployHook = () => process.env.VERCEL_DEPLOY_HOOK_URL,
  dryRun = process.env.PUBLISH_DRY_RUN === "true",
  log = console.log,
} = {}) {
  const duePosts = await getDuePosts();
  const missingPosts = [];
  for (const slug of duePosts) {
    const response = await fetchImpl(`https://growthcast.app/blog/${slug}`, { method: "HEAD", redirect: "follow" });
    if (response.status === 404) missingPosts.push(slug);
    else if (!response.ok) throw new Error(`Production URL check failed for ${slug} with status ${response.status}.`);
  }

  if (missingPosts.length === 0) {
    log("Scheduled publishing: no due unpublished posts.");
    return { action: "none", slugs: [] };
  }

  const blocked = [];
  for (const slug of missingPosts) {
    const readiness = await getReadiness(slug);
    if (!readiness.ready) blocked.push({ slug, reasons: readiness.reasons });
  }
  if (blocked.length > 0) {
    const detail = blocked.map(({ slug, reasons }) => `${slug}: ${reasons.join(", ")}`).join("; ");
    throw new Error(`Scheduled publishing blocked by content preflight: ${detail}`);
  }

  if (dryRun) {
    log(`Scheduled publishing dry run: QA and exact-hash approval passed; would rebuild for ${missingPosts.join(", ")}.`);
    return { action: "dry-run", slugs: missingPosts };
  }

  const deployHook = getDeployHook();
  if (!deployHook) throw new Error("VERCEL_DEPLOY_HOOK_URL is required after content preflight passes.");
  const response = await fetchImpl(deployHook, { method: "POST" });
  if (!response.ok) throw new Error(`Vercel deploy hook returned ${response.status}.`);
  log(`Scheduled publishing: triggered a rebuild for ${missingPosts.join(", ")}.`);
  return { action: "triggered", slugs: missingPosts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScheduledPublishing().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
