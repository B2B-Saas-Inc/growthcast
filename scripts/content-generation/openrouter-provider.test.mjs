import { describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "./openrouter-provider.mjs";

const env = { OPENROUTER_API_KEY: "test-only", OPENROUTER_MODEL: "test/model" };
const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("OpenRouterProvider", () => {
  it("fails before HTTP when environment credentials are missing", () => {
    expect(() => new OpenRouterProvider({ env: {} })).toThrow("OPENROUTER_API_KEY is required");
    expect(() => new OpenRouterProvider({ env: { OPENROUTER_API_KEY: "x" } })).toThrow("OPENROUTER_MODEL is required");
  });

  it("generates through the shared provider contract without exposing the key in the body", async () => {
    const fetchImpl = vi.fn(async () => response(200, {
      model: "resolved/model", choices: [{ message: { content: "Draft text" } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    }));
    const provider = new OpenRouterProvider({ env, fetchImpl });
    await expect(provider.generate({ system: "system", prompt: "draft", input: { brief: "approved" }, maximumOutputTokens: 500 })).resolves.toEqual({
      text: "Draft text", provider: "openrouter", model: "resolved/model", usage: { inputTokens: 12, outputTokens: 4 },
    });
    expect(fetchImpl.mock.calls[0][1].body).not.toContain("test-only");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer test-only");
  });

  it("returns deduplicated retrievable citation evidence", async () => {
    const fetchImpl = vi.fn(async () => response(200, { choices: [{ message: {
      content: "Research synthesis",
      annotations: [
        { url_citation: { url: "https://example.com/report", title: "Primary report", content: "Evidence excerpt" } },
        { url_citation: { url: "https://example.com/report", title: "Duplicate" } },
        { url_citation: { url: "javascript:bad", title: "Unsafe" } },
      ],
    } }] }));
    const provider = new OpenRouterProvider({ env, fetchImpl });
    const results = await provider.research({ query: "cost evidence", allowedSourceTypes: ["primary"], maximumResults: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ canonicalUrl: "https://example.com/report", title: "Duplicate", summary: "Evidence excerpt" });
    expect(results[0].contentSha256).toMatch(/^[a-f0-9]{64}$/u);
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.plugins).toEqual([{ id: "web", max_results: 5 }]);
  });

  it("retries throttling and server errors with bounded backoff", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(429, { error: "slow down" }))
      .mockResolvedValueOnce(response(503, { error: "unavailable" }))
      .mockResolvedValueOnce(response(200, { choices: [{ message: { content: "done" } }] }));
    const sleep = vi.fn(async () => {});
    const provider = new OpenRouterProvider({ env, fetchImpl, sleep });
    await expect(provider.generate({ system: "s", prompt: "p", input: null, maximumOutputTokens: 10 })).resolves.toMatchObject({ text: "done" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([100, 200]);
  });

  it("fails closed when web research has no URL citations", async () => {
    const provider = new OpenRouterProvider({ env, fetchImpl: async () => response(200, { choices: [{ message: { content: "Unsupported synthesis" } }] }) });
    await expect(provider.research({ query: "q", allowedSourceTypes: [], maximumResults: 2 })).rejects.toThrow("no retrievable URL citations");
  });
});
