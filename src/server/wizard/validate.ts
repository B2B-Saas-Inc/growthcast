// Boundary validation for every Positioning Wizard request body. Throws InputError with a user-safe message.
import {
  AD_PLATFORMS,
  ANGLES,
  FUNNEL_STAGES,
  LIMITS,
  RESEARCH_KINDS,
  UPLOAD_EXTENSIONS,
  UPLOAD_TYPES,
  URL_TYPES,
  WEBSITE_FORMATS,
} from "./config.js";

export class InputError extends Error {
  status = 400;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

export function text(value: unknown, field: string, { max, required = false }: { max: number; required?: boolean }) {
  const out = typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
  if (required && !out) throw new InputError(`${field} is required.`);
  if (out.length > max) throw new InputError(`${field} must be ${max} characters or fewer.`);
  return out;
}

function longText(value: unknown, field: string, max: number) {
  const out = typeof value === "string" ? value.trim() : "";
  if (out.length > max) throw new InputError(`${field} must be ${max} characters or fewer.`);
  return out;
}

function oneOf<T extends readonly string[]>(value: unknown, list: T, field: string): T[number] {
  if (typeof value === "string" && (list as readonly string[]).includes(value)) return value as T[number];
  throw new InputError(`Choose a valid ${field}.`);
}

export function email(value: unknown) {
  const out = text(value, "Email", { max: 254, required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(out)) throw new InputError("Enter a valid email address.");
  return out;
}

export function uuid(value: unknown, field = "id") {
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) return value;
  throw new InputError(`Invalid ${field}.`);
}

export function webUrl(value: unknown, field = "URL") {
  const raw = text(value, field, { max: 2000, required: true });
  let url: URL;
  try {
    url = new URL(/^https?:\/\//iu.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new InputError(`${field} is not a valid web address.`);
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) throw new InputError(`${field} must be a public http or https address.`);
  if (url.username || url.password) throw new InputError(`${field} must not contain credentials.`);
  url.hash = "";
  return url.toString();
}

export function signup(body: unknown) {
  const b = obj(body);
  if (b.consent !== true) throw new InputError("Please accept the terms to continue.");
  return { email: email(b.email), firstName: text(b.firstName, "First name", { max: 80, required: true }) };
}

export function newRun(body: unknown) {
  const b = obj(body);
  const website = b.website ? webUrl(b.website, "Website") : "";
  return {
    product: text(b.product, "Product or company", { max: 120, required: true }),
    feature: text(b.feature, "Feature", { max: 160 }),
    website,
    audience: text(b.audience, "Audience", { max: 500 }),
    competitors: text(b.competitors, "Competitors", { max: 500 }),
  };
}

export function urlEvidence(body: unknown) {
  const b = obj(body);
  return {
    url: webUrl(b.url),
    urlType: oneOf(b.urlType ?? "Other", URL_TYPES, "link type"),
    note: text(b.note, "Note", { max: 300 }),
  };
}

export function uploadEvidence(body: unknown) {
  const b = obj(body);
  const name = text(b.name, "File name", { max: 200, required: true }).replace(/[^\w .()-]+/gu, "_");
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!UPLOAD_EXTENSIONS.includes(ext)) throw new InputError(`Upload ${UPLOAD_EXTENSIONS.join(", ")} files. Export Word or PowerPoint files as PDF first.`);
  const kind = ext === ".pdf" ? "pdf" : "text";
  const mime = kind === "pdf" ? "application/pdf" : (UPLOAD_TYPES[String(b.mime)] ? String(b.mime) : "text/plain");
  if (kind === "pdf") {
    const data = typeof b.dataBase64 === "string" ? b.dataBase64 : "";
    if (!/^[A-Za-z0-9+/]+=*$/u.test(data)) throw new InputError("The PDF could not be read.");
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > LIMITS.uploadBytes) throw new InputError("Files must be 3 MB or smaller.", 413);
    if (!Buffer.from(data.slice(0, 8), "base64").toString("latin1").startsWith("%PDF")) throw new InputError("That file is not a valid PDF.");
    return { name, mime, kind, dataBase64: data, content: null as string | null };
  }
  const content = typeof b.text === "string" ? b.text : "";
  if (!content.trim()) throw new InputError("That file is empty.");
  if (Buffer.byteLength(content) > LIMITS.uploadBytes) throw new InputError("Files must be 3 MB or smaller.", 413);
  return { name, mime, kind, dataBase64: null as string | null, content };
}

export function researchBrief(body: unknown) {
  const b = obj(obj(body).brief);
  const kinds = Array.isArray(b.kinds) ? b.kinds.filter((k): k is string => (RESEARCH_KINDS as readonly string[]).includes(String(k))) : [];
  return {
    kinds: [...new Set(kinds)],
    competitors: text(b.competitors, "Competitors", { max: 500 }),
    queries: longText(b.queries, "Searches", 1000),
    audience: text(b.audience, "Audience", { max: 500 }),
    depth: b.depth === "deep" ? ("deep" as const) : ("standard" as const),
  };
}
export type ResearchBrief = ReturnType<typeof researchBrief>;

export function icpChoice(body: unknown) {
  const b = obj(obj(body).icp);
  return { name: text(b.name, "ICP", { max: 160, required: true }), summary: text(b.summary, "ICP summary", { max: 400 }) };
}

export const MODULES = ["research", "jtbd", "positioning", "pmm", "copy"] as const;
export type Module = (typeof MODULES)[number];

export function copyBrief(value: unknown) {
  const b = obj(value);
  const kind = b.kind === "ad" ? ("ad" as const) : b.kind === "website" ? ("website" as const) : null;
  if (!kind) throw new InputError("Choose website or ad copy.");
  return {
    kind,
    format: kind === "ad" ? oneOf(b.format, AD_PLATFORMS, "ad platform") : oneOf(b.format, WEBSITE_FORMATS, "page type"),
    funnelStage: oneOf(b.funnelStage, FUNNEL_STAGES, "funnel stage"),
    angle: oneOf(b.angle, ANGLES, "angle"),
    conversionAction: text(b.conversionAction, "Conversion action", { max: 120 }),
    variations: kind === "ad" ? Math.min(8, Math.max(1, Math.round(Number(b.variations) || 3))) : undefined,
    constraints: longText(b.constraints, "Constraints", 1000),
  };
}
export type CopyBrief = ReturnType<typeof copyBrief>;

export function moduleRequest(body: unknown) {
  const b = obj(body);
  const module = oneOf(b.module, MODULES, "module") as Module;
  const reviseJobId = b.reviseJobId ? uuid(b.reviseJobId, "revision target") : null;
  const notes = longText(b.notes, "Notes", 2000);
  if (reviseJobId && !notes) throw new InputError("Describe what should change.");
  return {
    runId: uuid(b.runId, "run"),
    module,
    notes,
    reviseJobId,
    copy: module === "copy" && !reviseJobId ? copyBrief(b.copy) : null,
  };
}
