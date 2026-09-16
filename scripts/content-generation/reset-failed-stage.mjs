#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function exactHash(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be an exact lowercase SHA-256`);
  return value;
}

/** Clears only the final failed stage after proving exact checkpoint identity and ancestor integrity. */
export async function resetFailedStage({ checkpointDirectory, runId, stage, expectedCheckpointSha256, expectedInitialInputSha256, expectedFailedInputSha256, now = () => new Date().toISOString() }) {
  if (!SAFE_RUN_ID.test(runId ?? "")) throw new Error("Run ID must be a safe filesystem identifier");
  if (!stage) throw new Error("Stage is required");
  const checkpointPath = path.join(path.resolve(checkpointDirectory), `${runId}.json`);
  const bytes = await readFile(checkpointPath);
  if (digest(bytes) !== exactHash(expectedCheckpointSha256, "Expected checkpoint hash")) throw new Error("Checkpoint byte identity mismatch");
  const checkpoint = JSON.parse(bytes.toString("utf8"));
  if (checkpoint.version !== 1 || checkpoint.runId !== runId || checkpoint.initialInputSha256 !== exactHash(expectedInitialInputSha256, "Expected initial input hash")) {
    throw new Error("Checkpoint does not match the exact run and initial input");
  }
  if (!Array.isArray(checkpoint.records) || checkpoint.records.length === 0) throw new Error("Checkpoint records are invalid");
  const failed = checkpoint.records.at(-1);
  if (failed.stage !== stage || failed.status !== "failed" || failed.inputSha256 !== exactHash(expectedFailedInputSha256, "Expected failed input hash") || "output" in failed || "outputSha256" in failed) {
    throw new Error("Only the exact final failed stage can be reset");
  }
  for (const record of checkpoint.records.slice(0, -1)) {
    if (record.status !== "completed" || !record.output || !SHA256.test(record.outputSha256 ?? "") || digest(stable(record.output)) !== record.outputSha256) {
      throw new Error(`Completed stage integrity check failed for ${record.stage ?? "unknown"}`);
    }
  }
  const reset = { ...checkpoint, records: checkpoint.records.slice(0, -1), reset: { stage, failedInputSha256: failed.inputSha256, resetAt: now() } };
  const temporary = `${checkpointPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(reset, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, checkpointPath);
  return reset;
}

function option(args, name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
async function main(args = process.argv.slice(2)) {
  const values = {
    checkpointDirectory: option(args, "--checkpoint-dir"), runId: option(args, "--run-id"), stage: option(args, "--stage"),
    expectedCheckpointSha256: option(args, "--checkpoint-sha256"), expectedInitialInputSha256: option(args, "--initial-input-sha256"),
    expectedFailedInputSha256: option(args, "--failed-input-sha256"),
  };
  if (Object.values(values).some((value) => !value)) throw new Error("Usage: reset-failed-stage --checkpoint-dir <dir> --run-id <id> --stage <stage> --checkpoint-sha256 <sha256> --initial-input-sha256 <sha256> --failed-input-sha256 <sha256>");
  const result = await resetFailedStage(values);
  console.log(`Reset failed ${values.stage}; preserved ${result.records.length} completed stages`);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
