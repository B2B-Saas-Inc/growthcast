import { describe, expect, it } from "vitest";
import { assessPublicationReadiness } from "./content-astro-adapter.mjs";

const hash = "a".repeat(64);
const passingReport = { result: "pass", findings: [] };
const article = { content_sha256: hash, approval: { content_sha256: hash } };

describe("Astro publication readiness", () => {
  it("accepts only passing QA, clean brand validation, and the exact article hash", () => {
    expect(assessPublicationReadiness(article, passingReport)).toMatchObject({ ready: true, reasons: [] });
  });

  it("invalidates approval after article content changes", () => {
    const changed = { ...article, content_sha256: "b".repeat(64) };
    expect(assessPublicationReadiness(changed, passingReport)).toMatchObject({
      ready: false,
      reasons: ["approval content hash does not match article"],
    });
  });

  it("fails closed for QA or GrowthCast profile findings", () => {
    expect(assessPublicationReadiness(article, { result: "fail", findings: [] }, [{ rule_id: "growthcast.cta" }])).toMatchObject({
      ready: false,
      reasons: ["shared QA report does not pass", "GrowthCast profile validation does not pass"],
    });
  });
});
