import { readdir, readFile } from "node:fs/promises";

const site = new URL("https://growthcast.app");
const key = "f9b38bc3f949f2035b78a684c1b4cab7";
const keyLocation = new URL(`/${key}.txt`, site).href;
const shouldSubmit = process.env.VERCEL_ENV === "production" || process.env.INDEXNOW_SUBMIT === "true";

if (!shouldSubmit) {
  console.log("IndexNow: skipped outside a production deployment.");
  process.exit(0);
}

const sitemapFiles = (await readdir("dist"))
  .filter((file) => /^sitemap-\d+\.xml$/.test(file))
  .sort();

const urlList = [];
for (const file of sitemapFiles) {
  const sitemap = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(match[1]);
    if (url.origin === site.origin) urlList.push(url.href);
  }
}

if (urlList.length === 0) {
  throw new Error("IndexNow: no canonical URLs were found in the generated sitemap.");
}

if (process.env.INDEXNOW_DRY_RUN === "true") {
  console.log(`IndexNow: would submit ${urlList.length} URLs with key ${keyLocation}.`);
  process.exit(0);
}

try {
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: site.hostname,
      key,
      keyLocation,
      urlList,
    }),
  });

  if (response.ok) {
    console.log(`IndexNow: submitted ${urlList.length} URLs (${response.status}).`);
  } else {
    console.warn(`IndexNow: submission returned ${response.status}; deployment will continue.`);
  }
} catch (error) {
  console.warn(`IndexNow: submission unavailable; deployment will continue. ${error instanceof Error ? error.message : error}`);
}
