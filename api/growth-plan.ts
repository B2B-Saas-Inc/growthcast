import { DEFAULT_POSTHOG_PROJECT_KEY } from "../src/posthog-project.js";

type Request = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status(code: number): Response; json(body: unknown): void; setHeader(name: string, value: string): void };

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) return res.status(415).json({ error: "application_json_required" });
  if (Buffer.byteLength(JSON.stringify(req.body ?? null)) > 200_000) return res.status(413).json({ error: "payload_too_large" });
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return res.status(400).json({ error: "invalid_request" });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const id = typeof body.submission_id === "string" ? body.submission_id : "";
  const snapshot = body.forecast_snapshot;
  if (!name || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || body.marketing_consent !== true || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return res.status(400).json({ error: "invalid_request" });
  const properties = {
    schema_version: "1.0", source: "growthcast.app", form_id: "forecast_growth_plan",
    submission_id: id, submitted_at: new Date().toISOString(), email, first_name: name,
    marketing_consent: true, consent_version: "growth-plan-v1",
    forecast_schema_version: "1.0", forecast_json: JSON.stringify(snapshot),
    test_record: body.test_record === true,
  };
  try {
    const response = await fetch(`${(process.env.POSTHOG_CAPTURE_HOST || "https://us.i.posthog.com").replace(/\/$/, "")}/capture/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: process.env.POSTHOG_PROJECT_TOKEN || DEFAULT_POSTHOG_PROJECT_KEY, uuid: id, event: "growth_plan_requested", distinct_id: email, properties: { ...properties, $set: { email, first_name: name }, $process_person_profile: true } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return res.status(502).json({ error: "delivery_failed" });
    return res.status(202).json({ submission_id: id });
  } catch {
    return res.status(502).json({ error: "delivery_failed" });
  }
}
