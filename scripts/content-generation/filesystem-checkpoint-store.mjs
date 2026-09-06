import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function checkpointPath(directory, runId) {
  if (!SAFE_RUN_ID.test(runId)) throw new TypeError("runId must be a safe filesystem identifier");
  return path.join(directory, `${runId}.json`);
}

function validateCheckpoint(value, runId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${runId}: checkpoint must be a JSON object`);
  if (value.version !== 1 || value.runId !== runId || typeof value.initialInputSha256 !== "string" || !Array.isArray(value.records)) {
    throw new Error(`${runId}: invalid checkpoint contract`);
  }
  return value;
}

/** Durable checkpoint storage for operator and CI runs. Writes are atomic on one filesystem. */
export class FilesystemCheckpointStore {
  constructor(directory) {
    if (!directory) throw new TypeError("checkpoint directory is required");
    this.directory = path.resolve(directory);
  }

  async load(runId) {
    const file = checkpointPath(this.directory, runId);
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      return structuredClone(validateCheckpoint(parsed, runId));
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      if (error instanceof SyntaxError) throw new Error(`${runId}: checkpoint contains invalid JSON`, { cause: error });
      throw error;
    }
  }

  async save(checkpoint) {
    validateCheckpoint(checkpoint, checkpoint?.runId);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = checkpointPath(this.directory, checkpoint.runId);
    const temporary = path.join(this.directory, `.${checkpoint.runId}.${process.pid}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
