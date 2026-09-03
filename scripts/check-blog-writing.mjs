import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../src/content/blog/", import.meta.url);
const bannedTransitions = [
  "furthermore",
  "moreover",
  "in addition",
  "it is worth noting",
  "that said",
  "in conclusion",
  "to summarize",
  "it is important to note",
  "this approach enables",
];
const abstractActors = [
  "accountability",
  "alignment",
  "change",
  "clarity",
  "culture",
  "execution",
  "growth",
  "innovation",
  "leadership",
  "momentum",
  "results",
  "strategy",
  "transformation",
  "trust",
];
const actionVerbs = "accelerates?|builds?|creates?|delivers?|drives?|enables?|finds?|gives?|helps?|keeps?|makes?|proves?|shows?|unlocks?";
const errors = [];

for (const file of await readdir(directory)) {
  if (!/\.mdx?$/.test(file)) continue;
  const source = await readFile(new URL(file, directory), "utf8");
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  if (body.includes("—")) errors.push(`${file}: contains an em dash`);
  if (body.includes("--")) errors.push(`${file}: contains a double hyphen`);
  for (const phrase of bannedTransitions) {
    if (body.toLowerCase().includes(phrase)) errors.push(`${file}: contains banned phrase “${phrase}”`);
  }
  const agencyPattern = new RegExp(`(?:^|[.!?]\\s+)(?:The\\s+)?(${abstractActors.join("|")})\\s+(?:${actionVerbs})\\b`, "gi");
  for (const match of body.matchAll(agencyPattern)) errors.push(`${file}: abstract subject performs an action near “${match[0].trim()}”`);
  if (!/\b(?:you|your|you’re|you’ll|you’ve)\b/i.test(body)) errors.push(`${file}: never addresses the reader directly`);
  if (!/[A-Za-z]+[’'][a-z]+/.test(body)) errors.push(`${file}: contains no natural contraction`);
}

if (errors.length) {
  console.error(`Human-first writing check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exit(1);
}

console.log("Human-first writing check passed.");
