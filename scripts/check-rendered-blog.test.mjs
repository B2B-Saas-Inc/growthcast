import { describe, expect, it } from "vitest";
import { validateRenderedBlogHtml } from "./check-rendered-blog.mjs";

const article = {
  title: "A useful title",
  description: "A specific description.",
  canonical_url: "https://growthcast.app/blog/useful",
  author: "EJ White",
  published_at: "2026-01-02T00:00:00.000Z",
  modified_at: "2026-01-03T00:00:00.000Z",
};

function page(overrides = {}) {
  const posting = {
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    mainEntityOfPage: article.canonical_url,
    author: { "@type": "Person", name: article.author },
    datePublished: article.published_at,
    dateModified: article.modified_at,
    ...overrides,
  };
  return `<!doctype html><html><head>
    <title>${article.title} | GrowthCast</title>
    <meta name="description" content="${article.description}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${article.canonical_url}">
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [posting] })}</script>
  </head></html>`;
}

describe("rendered blog validation", () => {
  it("accepts complete matching metadata and BlogPosting schema", () => {
    expect(validateRenderedBlogHtml(page(), article)).toEqual([]);
  });

  it("rejects non-indexable pages and mismatched author, dates, and canonical", () => {
    const html = page({ author: { name: "Wrong Author" }, dateModified: article.published_at, mainEntityOfPage: "https://growthcast.app/wrong" })
      .replace("index, follow, max-image-preview:large", "noindex, nofollow");
    expect(validateRenderedBlogHtml(html, article)).toEqual(expect.arrayContaining([
      expect.stringContaining("indexability"),
      expect.stringContaining("schema.mainEntityOfPage"),
      expect.stringContaining("schema.author"),
      expect.stringContaining("schema.dateModified"),
    ]));
  });

  it("rejects missing or malformed BlogPosting JSON-LD", () => {
    const html = page().replace(/<script[\s\S]*?<\/script>/u, '<script type="application/ld+json">{broken}</script>');
    expect(validateRenderedBlogHtml(html, article)).toEqual(expect.arrayContaining([
      expect.stringContaining("malformed JSON-LD"),
      expect.stringContaining("BlogPosting is missing"),
    ]));
  });
});
