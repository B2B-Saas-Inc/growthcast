import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orchestrate } from "@ejwhite/content-engine";
import { FilesystemCheckpointStore } from "./filesystem-checkpoint-store.mjs";

const directories = [];
async function store() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-checkpoint-"));
  directories.push(directory);
  return { directory, checkpointStore: new FilesystemCheckpointStore(directory) };
}

afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("FilesystemCheckpointStore", () => {
  it("persists checkpoints atomically and returns an isolated value", async () => {
    const { directory, checkpointStore } = await store();
    const checkpoint = { version: 1, runId: "run-1", initialInputSha256: "a".repeat(64), records: [] };
    await checkpointStore.save(checkpoint);
    const loaded = await checkpointStore.load("run-1");
    loaded.records.push({ unsafe: true });

    expect(await checkpointStore.load("run-1")).toEqual(checkpoint);
    expect(JSON.parse(await readFile(path.join(directory, "run-1.json"), "utf8"))).toEqual(checkpoint);
  });

  it("rejects path traversal and malformed checkpoint data", async () => {
    const { directory, checkpointStore } = await store();
    await expect(checkpointStore.load("../escape")).rejects.toThrow("safe filesystem identifier");
    await expect(checkpointStore.save({ version: 1, runId: "bad", records: [] })).rejects.toThrow("invalid checkpoint contract");
    await expect(readFile(path.join(directory, "bad.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lets shared orchestration resume without rerunning completed stages", async () => {
    const { checkpointStore } = await store();
    const research = vi.fn(async ({ input }) => ({ ...input, evidence: ["https://example.com/source"] }));
    const draft = vi.fn(async ({ input }) => ({ ...input, article: "reviewable draft" }));
    const options = {
      runId: "resumable-run",
      stages: ["research", "rough-draft"],
      handlers: { research: { id: "mock-research", run: research }, "rough-draft": { id: "mock-draft", run: draft } },
      checkpointStore,
    };

    const first = await orchestrate({ briefId: "approved-brief" }, options);
    const resumed = await orchestrate({ briefId: "approved-brief" }, options);

    expect(resumed).toEqual(first);
    expect(research).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(resumed.records.map((record) => record.stage)).toEqual(["research", "rough-draft"]);
  });

  it("fails closed when resume input differs from the durable checkpoint", async () => {
    const { checkpointStore } = await store();
    const options = {
      runId: "input-bound-run",
      stages: ["research"],
      handlers: { research: { id: "mock-research", run: async ({ input }) => input } },
      checkpointStore,
    };
    await orchestrate({ briefId: "approved-brief" }, options);
    await expect(orchestrate({ briefId: "changed-brief" }, options)).rejects.toThrow("resume input does not match checkpoint");
  });
});
