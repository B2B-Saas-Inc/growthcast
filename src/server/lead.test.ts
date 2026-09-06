import { describe, expect, it } from "vitest";
import { validateLead } from "./lead";

const valid = {
  first_name: " Avery ", last_name: "Morgan", work_email: "AVERY@EXAMPLE.COM",
  company_website: "https://example.com", job_title: "VP Marketing",
  primary_challenge: "Build pipeline", consent: true,
};

describe("validateLead", () => {
  it("builds the governed envelope", () => {
    const result = validateLead(valid, "lead_test", new Date("2026-09-06T12:00:00Z"));
    expect(result).toEqual({
      schema_version: "1.0", source: "growthcast.app", submission_id: "lead_test", submitted_at: "2026-09-06T12:00:00.000Z",
      lead: { first_name:"Avery", last_name:"Morgan", work_email:"avery@example.com", company_website:"https://example.com/", job_title:"VP Marketing", primary_challenge:"Build pipeline", consent:true },
    });
  });
  it.each([
    [{ ...valid, consent:false }], [{ ...valid, work_email:"bad" }], [{ ...valid, company_website:"javascript:alert(1)" }],
    [{ ...valid, primary_challenge:"" }],
  ])("rejects malformed or unapproved input", (input) => expect(() => validateLead(input, "lead_test")).toThrow());
});
