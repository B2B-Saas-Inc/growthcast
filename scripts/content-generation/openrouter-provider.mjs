import { createHash } from "node:crypto";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_ATTEMPTS = 3;

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for OpenRouter generation`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function citationEntries(message) {
  const annotations = Array.isArray(message?.annotations) ? message.annotations : [];
  const fromAnnotations = annotations.flatMap((annotation) => {
    const citation = annotation?.url_citation;
    return citation?.url ? [{ url: citation.url, title: citation.title, summary: citation.content }] : [];
  });
  const fromUrls = Array.isArray(message?.citations)
    ? message.citations.filter((url) => typeof url === "string").map((url) => ({ url }))
    : [];
  const unique = new Map();
  for (const citation of [...fromAnnotations, ...fromUrls]) {
    try {
      const url = new URL(citation.url);
      if (url.protocol !== "https:") continue;
      const canonicalUrl = url.toString();
      const current = unique.get(canonicalUrl);
      unique.set(canonicalUrl, {
        url: canonicalUrl,
        title: citation.title || current?.title || canonicalUrl,
        summary: citation.summary || current?.summary || message.content || "",
      });
    } catch {
      // Provider citation metadata is untrusted input; malformed URLs are omitted.
    }
  }
  return [...unique.values()];
}

export class OpenRouterProvider {
  id = "openrouter";

  constructor({ env = process.env, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.apiKey = requiredEnv(env, "OPENROUTER_API_KEY");
    this.model = requiredEnv(env, "OPENROUTER_MODEL");
    this.baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/u, "");
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.siteUrl = env.OPENROUTER_SITE_URL?.trim() || "";
    this.appName = env.OPENROUTER_APP_NAME?.trim() || "";
    this.maximumAttempts = Number(env.OPENROUTER_MAX_ATTEMPTS || DEFAULT_ATTEMPTS);
    if (!Number.isInteger(this.maximumAttempts) || this.maximumAttempts < 1 || this.maximumAttempts > 10) {
      throw new Error("OPENROUTER_MAX_ATTEMPTS must be an integer from 1 to 10");
    }
  }

  async request(body, signal) {
    let lastError;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(this.siteUrl ? { "HTTP-Referer": this.siteUrl } : {}),
            ...(this.appName ? { "X-Title": this.appName } : {}),
          },
          body: JSON.stringify(body),
          signal,
        });
        if (response.ok) return response.json();
        const detail = (await response.text()).slice(0, 500);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`OpenRouter request failed (${response.status}): ${detail}`);
        lastError = new Error(`OpenRouter request failed (${response.status}): ${detail}`);
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
      }
      if (attempt < this.maximumAttempts) await this.sleep(100 * (2 ** (attempt - 1)));
    }
    throw lastError;
  }

  async generate(request, signal) {
    const result = await this.request({
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: `${request.prompt}\n\nInput JSON:\n${JSON.stringify(request.input)}` },
      ],
      max_tokens: request.maximumOutputTokens,
      temperature: 0,
    }, signal);
    const text = result?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("OpenRouter returned no generated text");
    return {
      text,
      provider: this.id,
      model: result.model || this.model,
      ...(result.usage ? { usage: { inputTokens: result.usage.prompt_tokens || 0, outputTokens: result.usage.completion_tokens || 0 } } : {}),
    };
  }

  async research(request, signal) {
    const result = await this.request({
      model: this.model,
      messages: [{ role: "user", content: `Research this query using retrievable web sources: ${request.query}` }],
      plugins: [{ id: "web", max_results: request.maximumResults }],
      max_tokens: 2000,
      temperature: 0,
    }, signal);
    const message = result?.choices?.[0]?.message;
    const citations = citationEntries(message).slice(0, request.maximumResults);
    if (citations.length === 0) throw new Error("OpenRouter research returned no retrievable URL citations");
    const retrievedAt = new Date().toISOString();
    return citations.map((citation) => ({
      canonicalUrl: citation.url,
      title: citation.title,
      retrievedAt,
      contentSha256: sha256(citation.summary),
      summary: citation.summary,
      provider: this.id,
      model: result.model || this.model,
    }));
  }
}
