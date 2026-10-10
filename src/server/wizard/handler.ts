// HTTP entry for the Positioning Wizard (/api/wizard/*). Validates origin, session and input at the boundary.
import { CONSENT_TEXT, CONSENT_VERSION, LIMITS, wizardEnv, type Env } from "./config.js";
import { runModule } from "./pipeline.js";
import { cookieHeader, readCookie, signDevice, verifyDevice } from "./session.js";
import * as store from "./store.js";
import * as v from "./validate.js";
import { parseIcpCandidates } from "../../wizard/icp.js";

export type Req = { method?: string; url?: string; query?: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined>; body?: unknown };
export type Res = { status(code: number): Res; json(body: unknown): void; setHeader(name: string, value: string): void };

const header = (req: Req, key: string) => String(req.headers[key] ?? "");

function routeOf(req: Req) {
  const fromQuery = req.query?.route;
  const route = Array.isArray(fromQuery) ? fromQuery.join("/") : fromQuery;
  if (route) return route.replace(/^\/+|\/+$/gu, "");
  return new URL(req.url ?? "/", "http://x").pathname.replace(/^\/api\/wizard\/?/u, "").replace(/\/+$/u, "");
}

function publicJob(j: store.JobRow) {
  return { id: j.id, module: j.module, status: j.status, input: j.input, output: j.output, error: j.error, progress: j.progress, startedAt: j.started_at, finishedAt: j.finished_at };
}

async function captureSignup(env: ReturnType<typeof wizardEnv>, user: store.UserRow) {
  if (!env.posthog.token) return;
  try {
    await fetch(`${env.posthog.host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.posthog.token,
        event: "positioning_wizard_signup",
        distinct_id: user.email,
        properties: { first_name: user.first_name, consent_version: CONSENT_VERSION, $set: { email: user.email, first_name: user.first_name }, $process_person_profile: true },
      }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Analytics must never block sign-up.
  }
}

export async function handleWizard(req: Req, res: Res, processEnv: Env = process.env, deps: Partial<Parameters<typeof runModule>[0]> = {}) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const env = wizardEnv(processEnv);
  if (!env.ok) {
    console.error(`Positioning Wizard is missing configuration: ${env.missing.join(", ")}`);
    return res.status(503).json({ error: "unavailable", message: "The Positioning Wizard is temporarily unavailable." });
  }
  const method = req.method ?? "GET";
  const route = routeOf(req);
  if (method !== "GET") {
    if (!env.allowedOrigins.includes(header(req, "origin"))) return res.status(403).json({ error: "forbidden", message: "Reload the page and try again." });
    if (!header(req, "content-type").toLowerCase().startsWith("application/json")) return res.status(415).json({ error: "json_required" });
  }
  const sql = deps.sql ?? store.database(env.databaseUrl);
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  try {
    if (method === "POST" && route === "session") {
      const input = v.signup(body);
      const user = await store.upsertUser(sql, input.email, input.firstName, CONSENT_TEXT, CONSENT_VERSION);
      const existing = verifyDevice(readCookie(header(req, "cookie")), env.sessionSecret);
      const device = await store.attachDevice(sql, existing, user.id);
      res.setHeader("Set-Cookie", cookieHeader(signDevice(device.id, env.sessionSecret)));
      await captureSignup(env, user);
      return res.status(200).json({ firstName: user.first_name, email: user.email, remaining: store.remaining(user, device) });
    }

    const deviceId = verifyDevice(readCookie(header(req, "cookie")), env.sessionSecret);
    const ctx = deviceId ? await store.context(sql, deviceId) : null;
    if (method === "POST" && route === "logout") {
      res.setHeader("Set-Cookie", cookieHeader("", 0));
      return res.status(200).json({ ok: true });
    }
    // Anonymous visitors are an expected state on page load, not an error.
    if (!ctx && method === "GET" && route === "me") return res.status(200).json({ signedIn: false });
    if (!ctx) return res.status(401).json({ error: "signup_required", message: "Sign up with your email to use the Positioning Wizard." });
    const { device, user } = ctx;

    if (method === "GET" && route === "me") {
      const runs = await store.listRuns(sql, device.id, user.id);
      return res.status(200).json({ signedIn: true, firstName: user.first_name, email: user.email, remaining: store.remaining(user, device), limit: LIMITS.generations, runs });
    }
    if (method === "POST" && route === "runs") {
      const run = await store.createRun(sql, device.id, user.id, v.newRun(body));
      return res.status(201).json({ id: run.id });
    }

    const runId = v.uuid(method === "GET" ? req.query?.id : body.runId, "run");
    const run = await store.getRun(sql, runId, device.id, user.id);

    if (method === "GET" && route === "run") {
      const [evidence, jobs] = await Promise.all([store.listEvidence(sql, run.id), store.listJobs(sql, run.id)]);
      const positioning = [...jobs].reverse().find((j) => j.module === "positioning" && j.status === "succeeded");
      return res.status(200).json({
        run: { id: run.id, product: run.product, feature: run.feature, website: run.website, audience: run.audience, researchBrief: run.research_brief, icp: run.icp, createdAt: run.created_at },
        evidence: evidence.map((e) => ({
          id: e.id, kind: e.kind, name: e.name, url: e.url, urlType: e.url_type, note: e.note, status: e.status, error: e.error,
          chars: e.status === "ready" ? e.content?.length ?? 0 : 0,
        })),
        jobs: jobs.map(publicJob),
        icps: parseIcpCandidates(positioning?.output),
        limits: { ...LIMITS },
      });
    }
    if (method === "POST" && route === "evidence") {
      if (body.kind === "url") {
        const e = v.urlEvidence(body);
        await store.addEvidence(sql, run.id, { kind: "url", name: e.url, url: e.url, urlType: e.urlType, note: e.note, status: "pending" });
      } else {
        const e = v.uploadEvidence(body);
        await store.addEvidence(sql, run.id, {
          kind: "upload", name: e.name, mime: e.mime,
          content: e.kind === "pdf" ? e.dataBase64 : e.content,
          status: e.kind === "pdf" ? "pending" : "ready",
        });
      }
      return res.status(201).json({ ok: true });
    }
    if (method === "DELETE" && route === "evidence") {
      await store.deleteEvidence(sql, run.id, v.uuid(body.id, "evidence"));
      return res.status(200).json({ ok: true });
    }
    if (method === "POST" && route === "brief") {
      await store.updateRun(sql, run.id, { research_brief: v.researchBrief(body) });
      return res.status(200).json({ ok: true });
    }
    if (method === "POST" && route === "icp") {
      await store.updateRun(sql, run.id, { icp: v.icpChoice(body) });
      return res.status(200).json({ ok: true });
    }
    if (method === "POST" && route === "module") {
      const job = await runModule({ sql, env, ...deps }, run, v.moduleRequest(body));
      return res.status(job.status === "succeeded" ? 200 : 502).json({ job: { id: job.id, module: job.module, status: job.status, error: "error" in job ? job.error : null } });
    }
    return res.status(404).json({ error: "not_found" });
  } catch (error) {
    if (error instanceof v.InputError) return res.status(error.status).json({ error: "invalid", message: error.message });
    console.error("Positioning Wizard request failed", { route, error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: "server_error", message: "Something went wrong. Please try again." });
  }
}
