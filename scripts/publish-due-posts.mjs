import { readdir, readFile } from "node:fs/promises";

const contentDirectory = new URL("../src/content/blog/", import.meta.url);
const deployHook = process.env.VERCEL_DEPLOY_HOOK_URL;
const dryRun = process.env.PUBLISH_DRY_RUN === "true";

if (!deployHook && !dryRun) throw new Error("VERCEL_DEPLOY_HOOK_URL is required.");

const now = Date.now();
const duePosts = [];
for (const file of await readdir(contentDirectory)) {
  if (!/\.mdx?$/.test(file)) continue;
  const source = await readFile(new URL(file, contentDirectory), "utf8");
  const publishedAt = source.match(/^publishedAt:\s*(.+)$/m)?.[1]?.trim();
  const draft = source.match(/^draft:\s*(.+)$/m)?.[1]?.trim() === "true";
  if (!publishedAt || draft || Date.parse(publishedAt) > now) continue;
  duePosts.push(file.replace(/\.mdx?$/, ""));
}

const missingPosts = [];
for (const slug of duePosts) {
  const response = await fetch(`https://growthcast.app/blog/${slug}`, { method: "HEAD", redirect: "follow" });
  if (response.status === 404) missingPosts.push(slug);
}

if (missingPosts.length === 0) {
  console.log("Scheduled publishing: no due unpublished posts.");
  process.exit(0);
}

if (dryRun) {
  console.log(`Scheduled publishing dry run: would rebuild for ${missingPosts.join(", ")}.`);
  process.exit(0);
}

const response = await fetch(deployHook, { method: "POST" });
if (!response.ok) throw new Error(`Vercel deploy hook returned ${response.status}.`);
console.log(`Scheduled publishing: triggered a rebuild for ${missingPosts.join(", ")}.`);
