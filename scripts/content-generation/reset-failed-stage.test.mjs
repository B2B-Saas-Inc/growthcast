import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resetFailedStage } from "./reset-failed-stage.mjs";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "growthcast-reset-"));
  const runId = "exact-run-v2";
  const output = { kept: true, nested: { value: 1 } };
  const checkpoint = { version: 1, runId, initialInputSha256: "a".repeat(64), records: [
    { stage: "research", status: "completed", attempts: 1, inputSha256: "b".repeat(64), outputSha256: hash(stable(output)), output },
    { stage: "human-first-edit", status: "failed", attempts: 3, inputSha256: "c".repeat(64), error: "too short" },
  ] };
  const file = path.join(directory, `${runId}.json`);
  await writeFile(file, `${JSON.stringify(checkpoint, null, 2)}\n`);
  const bytes = await readFile(file);
  return { directory, runId, file, bytes, checkpoint };
}

describe("failed-stage reset", () => {
  it("removes only the exact failed record and preserves completed output", async () => {
    const item = await fixture();
    const reset = await resetFailedStage({ checkpointDirectory: item.directory, runId: item.runId, stage: "human-first-edit", expectedCheckpointSha256: hash(item.bytes), expectedInitialInputSha256: "a".repeat(64), expectedFailedInputSha256: "c".repeat(64), now: () => "2026-09-09T22:00:00.000Z" });
    expect(reset.records).toEqual(item.checkpoint.records.slice(0, 1));
    expect(reset.reset).toEqual({ stage: "human-first-edit", failedInputSha256: "c".repeat(64), resetAt: "2026-09-09T22:00:00.000Z" });
  });

  it("fails without mutation for identity mismatch or completed-output tampering", async () => {
    const mismatch = await fixture();
    await expect(resetFailedStage({ checkpointDirectory: mismatch.directory, runId: mismatch.runId, stage: "human-first-edit", expectedCheckpointSha256: "d".repeat(64), expectedInitialInputSha256: "a".repeat(64), expectedFailedInputSha256: "c".repeat(64) })).rejects.toThrow("byte identity");
    expect(await readFile(mismatch.file)).toEqual(mismatch.bytes);

    const tampered = await fixture();
    const parsed = JSON.parse(tampered.bytes.toString());
    parsed.records[0].output.kept = false;
    await writeFile(tampered.file, `${JSON.stringify(parsed, null, 2)}\n`);
    const changed = await readFile(tampered.file);
    await expect(resetFailedStage({ checkpointDirectory: tampered.directory, runId: tampered.runId, stage: "human-first-edit", expectedCheckpointSha256: hash(changed), expectedInitialInputSha256: "a".repeat(64), expectedFailedInputSha256: "c".repeat(64) })).rejects.toThrow("integrity");
    expect(await readFile(tampered.file)).toEqual(changed);
  });
});
