// Minimal OpenRouter chat client for the Positioning Wizard: bounded retries, web search and PDF parsing plugins,
// and citation extraction. Mirrors scripts/content-generation/openrouter-provider.mjs conventions.
import type { WizardEnv } from "./config.js";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatRequest = {
  system: string;
  user: string | ContentPart[];
  maxTokens: number;
  web?: { maxResults: number };
  pdf?: boolean;
  signal?: AbortSignal;
};

export type Citation = { url: string; title: string };
export type ChatResult = { text: string; model: string; usage?: { inputTokens: number; outputTokens: number }; citations: Citation[] };

type FetchLike = typeof fetch;

export function citationsFrom(message: unknown): Citation[] {
  const m = (message ?? {}) as { annotations?: unknown; citations?: unknown };
  const entries: Citation[] = [];
  if (Array.isArray(m.annotations)) {
    for (const a of m.annotations) {
      const c = (a as { url_citation?: { url?: unknown; title?: unknown } })?.url_citation;
      if (typeof c?.url === "string") entries.push({ url: c.url, title: typeof c.title === "string" ? c.title : "" });
    }
  }
  if (Array.isArray(m.citations)) for (const url of m.citations) if (typeof url === "string") entries.push({ url, title: "" });
  const unique = new Map<string, Citation>();
  for (const entry of entries) {
    try {
      const url = new URL(entry.url);
      if (!["https:", "http:"].includes(url.protocol)) continue;
      const key = url.toString();
      unique.set(key, { url: key, title: entry.title || unique.get(key)?.title || url.hostname });
    } catch {
      // Provider citation metadata is untrusted; malformed URLs are dropped.
    }
  }
  return [...unique.values()];
}

export async function chat(env: WizardEnv["openRouter"], req: ChatRequest, fetchImpl: FetchLike = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<ChatResult> {
  const plugins = [
    ...(req.web ? [{ id: "web", max_results: req.web.maxResults }] : []),
    ...(req.pdf ? [{ id: "file-parser", pdf: { engine: "pdf-text" } }] : []),
  ];
  const body = {
    model: env.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    max_tokens: req.maxTokens,
    temperature: 0.3,
    ...(plugins.length ? { plugins } : {}),
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= env.maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${env.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.siteUrl,
          "X-Title": env.appName,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (response.ok) {
        const result = (await response.json()) as {
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          choices?: { message?: { content?: unknown } }[];
        };
        const message = result.choices?.[0]?.message;
        const text = typeof message?.content === "string" ? message.content.trim() : "";
        if (!text) throw new Error("The model returned no text.");
        return {
          text,
          model: result.model || env.model,
          usage: result.usage ? { inputTokens: result.usage.prompt_tokens ?? 0, outputTokens: result.usage.completion_tokens ?? 0 } : undefined,
          citations: citationsFrom(message),
        };
      }
      const detail = (await response.text()).slice(0, 300);
      lastError = new Error(`OpenRouter request failed (${response.status}): ${detail}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      if (req.signal?.aborted) throw error;
      lastError = error;
      if (error instanceof Error && /OpenRouter request failed \(4(?!29)/u.test(error.message)) throw error;
    }
    if (attempt < env.maxAttempts) await sleep(400 * 2 ** (attempt - 1));
  }
  throw lastError instanceof Error ? lastError : new Error("OpenRouter request failed.");
}
