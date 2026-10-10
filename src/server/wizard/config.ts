// Positioning Wizard limits and environment. Server-only: never import from browser code.
import { GENERATION_LIMIT, UPLOAD_MAX_BYTES } from "../../wizard/constants.js";

export const LIMITS = {
  generations: GENERATION_LIMIT,
  uploadsPerRun: 8,
  uploadBytes: UPLOAD_MAX_BYTES, // base64 JSON must stay under Vercel's 4.5 MB request body limit
  urlsPerRun: 10,
  copyPerRun: 5,
  revisionsPerModule: 3,
  jobsPerRun: 30,
  evidenceCharsPerSource: 20_000,
  evidenceCharsTotal: 120_000,
  priorOutputChars: 40_000,
  jobTimeoutMs: 270_000,
  staleJobMs: 6 * 60_000,
} as const;

export {
  AD_PLATFORMS,
  ANGLES,
  CONSENT_TEXT,
  CONSENT_VERSION,
  FUNNEL_STAGES,
  RESEARCH_KINDS,
  UPLOAD_EXTENSIONS,
  URL_TYPES,
  WEBSITE_FORMATS,
} from "../../wizard/constants.js";

export const UPLOAD_TYPES: Record<string, "pdf" | "text"> = {
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "text/vtt": "text",
  "application/json": "text",
};

export type Env = Record<string, string | undefined>;

export function wizardEnv(env: Env = process.env) {
  const sessionSecret = env.WIZARD_SESSION_SECRET?.trim() ?? "";
  const databaseUrl = env.POSTGRES_URL?.trim() || env.DATABASE_URL?.trim() || "";
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  const model = env.WIZARD_OPENROUTER_MODEL?.trim() || env.OPENROUTER_MODEL?.trim() || "";
  const missing = [
    sessionSecret.length < 32 && "WIZARD_SESSION_SECRET (32+ characters)",
    !databaseUrl && "POSTGRES_URL",
    !apiKey && "OPENROUTER_API_KEY",
    !model && "WIZARD_OPENROUTER_MODEL or OPENROUTER_MODEL",
  ].filter(Boolean) as string[];
  return {
    ok: missing.length === 0,
    missing,
    sessionSecret,
    databaseUrl,
    openRouter: {
      apiKey,
      model,
      baseUrl: (env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/u, ""),
      maxAttempts: Math.min(10, Math.max(1, Number(env.OPENROUTER_MAX_ATTEMPTS) || 3)),
      siteUrl: env.OPENROUTER_SITE_URL?.trim() || "https://growthcast.app",
      appName: "GrowthCast Positioning Wizard",
    },
    posthog: {
      token: env.POSTHOG_PROJECT_TOKEN?.trim() || "",
      host: (env.POSTHOG_CAPTURE_HOST?.trim() || "https://us.i.posthog.com").replace(/\/$/u, ""),
    },
    allowedOrigins: [
      "https://growthcast.app",
      "https://www.growthcast.app",
      ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
      ...(env.VERCEL_BRANCH_URL ? [`https://${env.VERCEL_BRANCH_URL}`] : []),
      ...(env.VERCEL_ENV === "production" ? [] : ["http://127.0.0.1:4173", "http://localhost:4173", "http://localhost:3000"]),
    ],
  };
}
export type WizardEnv = ReturnType<typeof wizardEnv>;
