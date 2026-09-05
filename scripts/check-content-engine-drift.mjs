import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { loadConfiguration } from "@ejwhite/content-engine";

const expected = Object.freeze({
  dependency: "file:vendor/content-engine/ejwhite-content-engine-0.1.0-473d26fdc3ee.tgz",
  packageVersion: "0.1.0",
  sha256: "473d26fdc3eecdf2f811ec16e94a3ea6198c068fdbbdccb5173136e8fb331f76",
  profileVersion: "1.0.0",
  policyVersion: "1.0.0",
});
const artifact = new URL("../vendor/content-engine/ejwhite-content-engine-0.1.0-473d26fdc3ee.tgz", import.meta.url);
const failures = [];
const parseJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

const [manifest, lockfile, artifactBytes, configuration] = await Promise.all([
  parseJson("../package.json"),
  parseJson("../package-lock.json"),
  readFile(artifact),
  loadConfiguration(),
]);

if (manifest.dependencies?.["@ejwhite/content-engine"] !== expected.dependency) {
  failures.push(`package.json must pin @ejwhite/content-engine to ${expected.dependency}`);
}
const locked = lockfile.packages?.["node_modules/@ejwhite/content-engine"];
if (locked?.version !== expected.packageVersion || locked?.resolved !== expected.dependency.replace("file:", "file:")) {
  failures.push("package-lock.json does not match the expected vendored engine version and artifact");
}
const digest = createHash("sha256").update(artifactBytes).digest("hex");
if (digest !== expected.sha256) failures.push(`vendored artifact SHA-256 mismatch: received ${digest}`);

const growthcast = configuration.profiles.growthcast;
if (growthcast.version !== expected.profileVersion) failures.push(`GrowthCast profile must be ${expected.profileVersion}`);
if (growthcast.publishing.approval_required !== true || growthcast.publishing.schedule_requires_matching_approval_hash !== true) {
  failures.push("GrowthCast profile must require approval and an exact matching schedule hash");
}
for (const [policyId, policy] of Object.entries(configuration.policies)) {
  if (policy.version !== expected.policyVersion || growthcast.extends_policies[policyId] !== policy.version) {
    failures.push(`${policyId} must be supported at ${expected.policyVersion} and exactly inherited by GrowthCast`);
  }
}

for (const relativePath of [
  "../policies/universal-editorial.yaml",
  "../policies/evidence.yaml",
  "../policies/search-discoverability.yaml",
]) {
  try {
    await access(new URL(relativePath, import.meta.url));
    failures.push(`${relativePath.replace("../", "")} is a forbidden local copy of canonical shared policy`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

if (failures.length > 0) {
  console.error(`Content-engine compatibility check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`Content-engine compatibility passed (${expected.packageVersion}, profile/policies ${expected.profileVersion}, ${digest}).`);
