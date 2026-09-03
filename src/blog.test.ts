import { afterEach, describe, expect, it, vi } from "vitest";
import { isPublishedPost } from "./blog";

describe("isPublishedPost", () => {
  afterEach(() => vi.useRealTimers());

  it("includes a due non-draft post", () => {
    vi.setSystemTime(new Date("2026-09-03T19:45:00Z"));
    expect(isPublishedPost({ data: { publishedAt: new Date("2026-09-03T19:45:00Z") } })).toBe(true);
  });

  it("excludes drafts and future posts", () => {
    vi.setSystemTime(new Date("2026-09-03T19:44:59Z"));
    expect(isPublishedPost({ data: { draft: true, publishedAt: new Date("2026-09-03T18:00:00Z") } })).toBe(false);
    expect(isPublishedPost({ data: { publishedAt: new Date("2026-09-03T19:45:00Z") } })).toBe(false);
  });
});
