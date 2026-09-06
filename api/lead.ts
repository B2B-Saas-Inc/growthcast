import { randomUUID } from "node:crypto";
import { DEFAULT_POSTHOG_PROJECT_KEY } from "../src/posthog-project.js";
import { validateLead } from "../src/server/lead.js";

type Request = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status(code: number): Response; json(body: unknown): void; setHeader(name: string, value: string): void };

const MAX_BODY_BYTES = 16_384;

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) return res.status(415).json({ error: "application_json_required" });
  const size = Buffer.byteLength(JSON.stringify(req.body ?? null));
  if (size > MAX_BODY_BYTES) return res.status(413).json({ error: "payload_too_large" });

  const token = process.env.POSTHOG_PROJECT_TOKEN || DEFAULT_POSTHOG_PROJECT_KEY;
  const host = (process.env.POSTHOG_CAPTURE_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const submissionId = `lead_${randomUUID()}`;
  let envelope;
  try { envelope = validateLead(req.body, submissionId); }
  catch { return res.status(400).json({ error: "invalid_lead" }); }

  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event: "lead_form_submitted",
        distinct_id: envelope.lead.work_email,
        timestamp: envelope.submitted_at,
        properties: { ...envelope, $process_person_profile: true },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return res.status(502).json({ error: "lead_delivery_failed" });
    return res.status(202).json({ submission_id: submissionId });
  } catch {
    return res.status(502).json({ error: "lead_delivery_failed" });
  }
}
