import { describe, expect, it } from "vitest";
import { assessPublicationReadiness, validateInventoryQa } from "./content-astro-adapter.mjs";

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

  it("accepts a byte-verified exact-bundle materialization during inventory validation", () => {
    const report = { result: "fail", findings: [{ class: "hard", rule_id: "growthcast.no-em-dash" }] };
    expect(validateInventoryQa(report, [{ rule_id: "growthcast.no-em-dash" }], {
      status: "exact-bundle-materialization-verified",
    })).toBe(true);
    expect(validateInventoryQa(report, [{ rule_id: "growthcast.no-em-dash" }], null)).toBe(false);
  });

  it("grandfathers title-only findings only for read-only historical inventory checks", () => {
    const report = { result: "fail", findings: [
      { class: "hard", rule_id: "editorial.concise-natural-title" },
      { class: "hard", rule_id: "editorial.exact-hash-approval" },
    ] };
    expect(validateInventoryQa(report)).toBe(true);
    expect(validateInventoryQa({ ...report, findings: [...report.findings, { class: "hard", rule_id: "evidence.traceability" }] })).toBe(false);
    expect(assessPublicationReadiness(article, report)).toMatchObject({ ready: false });
  });
});
