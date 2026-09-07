export type LeadEnvelope = {
  schema_version: "1.0";
  source: "growthcast.app";
  submission_id: string;
  submitted_at: string;
  lead: {
    first_name: string;
    last_name: string;
    work_email: string;
    company_website: string;
    job_title: string;
    primary_challenge: string;
    consent: true;
    test_record: boolean;
  };
};

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLead(input: unknown, submissionId: string, now = new Date()): LeadEnvelope {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_body");
  const body = input as Record<string, unknown>;
  const firstName = clean(body.first_name, 80);
  const lastName = clean(body.last_name, 80);
  const email = clean(body.work_email, 254).toLowerCase();
  const website = clean(body.company_website, 300);
  const title = clean(body.job_title, 120);
  const challenge = clean(body.primary_challenge, 2000);
  if (!firstName || !lastName || !emailPattern.test(email) || !title || !challenge) throw new Error("missing_or_invalid_fields");
  let parsedWebsite: URL;
  try { parsedWebsite = new URL(website); } catch { throw new Error("invalid_company_website"); }
  if (parsedWebsite.protocol !== "https:" && parsedWebsite.protocol !== "http:") throw new Error("invalid_company_website");
  if (body.consent !== true) throw new Error("consent_required");
  return {
    schema_version: "1.0", source: "growthcast.app", submission_id: submissionId, submitted_at: now.toISOString(),
    lead: { first_name:firstName, last_name:lastName, work_email:email, company_website:parsedWebsite.toString(), job_title:title,
      primary_challenge:challenge, consent:true, test_record:body.test_record === true }
  };
}
