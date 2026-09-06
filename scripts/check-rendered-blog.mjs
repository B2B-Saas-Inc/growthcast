import { readFile } from "node:fs/promises";
import path from "node:path";
import { inventory, loadArticle } from "./content-astro-adapter.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function tagAttribute(html, tagPattern, attribute) {
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return null;
  return decodeHtml(tag.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, "iu"))?.[1] ?? "");
}

function collectJsonLd(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)]
    .map((match) => JSON.parse(match[1]));
}

function findTypedNode(value, type) {
  if (Array.isArray(value)) return value.map((item) => findTypedNode(item, type)).find(Boolean);
  if (!value || typeof value !== "object") return null;
  if (value["@type"] === type) return value;
  return findTypedNode(value["@graph"], type);
}

export function validateRenderedBlogHtml(html, article) {
  const failures = [];
  const expect = (condition, field, detail) => { if (!condition) failures.push(`${field}: ${detail}`); };
  const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]?.trim() ?? "");
  const description = tagAttribute(html, /<meta\b[^>]*name=["']description["'][^>]*>/iu, "content");
  const robots = tagAttribute(html, /<meta\b[^>]*name=["']robots["'][^>]*>/iu, "content");
  const canonical = tagAttribute(html, /<link\b[^>]*rel=["']canonical["'][^>]*>/iu, "href");
  expect(title === `${article.title} | GrowthCast`, "title", "does not match article title");
  expect(description === article.description, "description", "does not match article description");
  expect(canonical === article.canonical_url, "canonical", "does not match canonical URL");
  expect(robots?.includes("index") && !robots.includes("noindex"), "indexability", "published article must be indexable");

  let schemas = [];
  try { schemas = collectJsonLd(html); } catch (error) { failures.push(`schema: malformed JSON-LD (${error.message})`); }
  const posting = schemas.map((schema) => findTypedNode(schema, "BlogPosting")).find(Boolean);
  expect(Boolean(posting), "schema", "BlogPosting is missing");
  if (posting) {
    expect(posting.headline === article.title, "schema.headline", "does not match article title");
    expect(posting.description === article.description, "schema.description", "does not match article description");
    expect(posting.mainEntityOfPage === article.canonical_url, "schema.mainEntityOfPage", "does not match canonical URL");
    expect(posting.author?.name === article.author, "schema.author", "does not match article author");
    expect(posting.datePublished === article.published_at, "schema.datePublished", "does not match publication date");
    expect(posting.dateModified === article.modified_at, "schema.dateModified", "does not match modified date");
  }
  return failures;
}

export async function checkRenderedBlog({ dist = DIST, now = Date.now() } = {}) {
  const failures = [];
  const published = (await inventory()).filter((item) => !item.draft && Date.parse(item.published_at) <= now);
  for (const item of published) {
    const output = path.join(dist, "blog", item.slug, "index.html");
    let html;
    try { html = await readFile(output, "utf8"); }
    catch (error) { failures.push(`${item.slug}: rendered output missing (${error.code ?? error.message})`); continue; }
    const article = await loadArticle(item.slug);
    failures.push(...validateRenderedBlogHtml(html, article).map((failure) => `${item.slug}: ${failure}`));
  }
  if (failures.length) throw new Error(`Rendered blog validation failed:\n- ${failures.join("\n- ")}`);
  return { checked: published.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkRenderedBlog().then(({ checked }) => console.log(`Rendered blog validation passed for ${checked} article(s).`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
