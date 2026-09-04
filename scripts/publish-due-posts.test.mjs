import { describe, expect, it, vi } from "vitest";
import { runScheduledPublishing } from "./publish-due-posts.mjs";

const due = async () => ["due-post"];
const ready = async () => ({ ready: true, reasons: [] });

function network(status = 404) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, options) => {
    calls.push({ url, method: options.method });
    return options.method === "HEAD" ? { status, ok: status < 400 } : { status: 200, ok: true };
  });
  return { calls, fetchImpl };
}

const hook = () => "https://hook.invalid";

describe("scheduled blog publication gate", () => {
  it("does not access or call the hook when shared QA fails", async () => {
    const { calls, fetchImpl } = network();
    const getDeployHook = vi.fn(hook);
    await expect(runScheduledPublishing({ fetchImpl, getDuePosts: due, getReadiness: async () => ({ ready: false, reasons: ["shared QA report does not pass"] }), getDeployHook })).rejects.toThrow("shared QA report does not pass");
    expect(getDeployHook).not.toHaveBeenCalled();
    expect(calls).toEqual([{ url: "https://growthcast.app/blog/due-post", method: "HEAD" }]);
  });

  it("does not access or call the hook when approval is missing or its hash differs", async () => {
    for (const reason of ["exact-hash approval is missing", "approval content hash does not match article"]) {
      const { calls, fetchImpl } = network();
      const getDeployHook = vi.fn(hook);
      await expect(runScheduledPublishing({ fetchImpl, getDuePosts: due, getReadiness: async () => ({ ready: false, reasons: [reason] }), getDeployHook })).rejects.toThrow(reason);
      expect(getDeployHook).not.toHaveBeenCalled();
      expect(calls).toHaveLength(1);
    }
  });

  it("fails closed without accessing the hook when the production HEAD check fails", async () => {
    const { calls, fetchImpl } = network(503);
    const getDeployHook = vi.fn(hook);
    await expect(runScheduledPublishing({ fetchImpl, getDuePosts: due, getReadiness: ready, getDeployHook })).rejects.toThrow("status 503");
    expect(getDeployHook).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("never accesses or calls the hook in dry-run mode after preflight passes", async () => {
    const { calls, fetchImpl } = network();
    const getDeployHook = vi.fn(hook);
    const result = await runScheduledPublishing({ fetchImpl, getDuePosts: due, getReadiness: ready, dryRun: true, getDeployHook, log: () => {} });
    expect(result).toEqual({ action: "dry-run", slugs: ["due-post"] });
    expect(getDeployHook).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("accesses and calls the repository-owned hook only after preflight passes", async () => {
    const { calls, fetchImpl } = network();
    const getDeployHook = vi.fn(hook);
    const result = await runScheduledPublishing({ fetchImpl, getDuePosts: due, getReadiness: ready, getDeployHook, log: () => {} });
    expect(result.action).toBe("triggered");
    expect(getDeployHook).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      { url: "https://growthcast.app/blog/due-post", method: "HEAD" },
      { url: "https://hook.invalid", method: "POST" },
    ]);
  });
});
