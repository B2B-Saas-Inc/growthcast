// Positioning Wizard exports: one step as Markdown or PDF, or the whole run as a ZIP bundle.
// Runs entirely in the browser from documents the user can already see; nothing is sent anywhere.
import { jsPDF } from "jspdf";
import JSZip from "jszip";

export type ExportModule = "research" | "jtbd" | "positioning" | "pmm" | "copy";
export type ExportJob = { id: string; module: ExportModule; status: string; input: { reviseJobId?: string; copy?: { format?: string } }; output: string | null; startedAt: string };
export type ExportEvidence = { kind: "upload" | "url"; name: string; url: string | null; urlType: string | null; note: string; status: string; error: string | null };
export type ExportRun = { product: string; feature: string; website: string; audience: string; icp: { name: string; summary?: string } | null };
export type ExportDoc = { file: string; title: string; markdown: string; module: ExportModule; version: string; createdAt: string };

export const STEP_META: Record<ExportModule, { num: string; name: string; slug: string }> = {
  research: { num: "00", name: "Evidence and research notes", slug: "research-notes" },
  jtbd: { num: "01", name: "Jobs-to-be-Done analysis", slug: "jobs-to-be-done" },
  positioning: { num: "02", name: "Positioning", slug: "positioning" },
  pmm: { num: "03", name: "ICP product marketing guidance", slug: "icp-guidance" },
  copy: { num: "04", name: "Copy", slug: "copy" },
};
const ORDER: ExportModule[] = ["research", "jtbd", "positioning", "pmm", "copy"];

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "growthcast";

const ICP_BLOCK = /```json\s+icp-candidates\s*\n[\s\S]*?```\s*/gu;
/** Markdown for people: drops the machine-readable ICP block the app uses internally. */
export const cleanMarkdown = (md: string) => md.replace(ICP_BLOCK, "").replace(/\n{3,}/gu, "\n\n").trim() + "\n";

/** Follows revision links back to the original document a version belongs to. */
function rootOf(job: ExportJob, byId: Map<string, ExportJob>) {
  let current = job;
  const seen = new Set<string>();
  while (current.input.reviseJobId && byId.has(current.input.reviseJobId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.input.reviseJobId)!;
  }
  return current;
}

/** Every saved document version, grouped into documents (one per step, one per copy piece), oldest first. */
export function documentGroups(jobs: ExportJob[]) {
  const done = jobs.filter((j) => j.status === "succeeded" && j.output);
  const byId = new Map(done.map((j) => [j.id, j]));
  const groups = new Map<string, ExportJob[]>();
  for (const job of done) {
    const key = job.module === "copy" ? `copy:${rootOf(job, byId).id}` : job.module;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups.entries()]
    .map(([key, versions]) => ({ key, module: versions[0].module, root: key.startsWith("copy:") ? byId.get(key.slice(5)) ?? versions[0] : versions[0], versions }))
    .sort((a, b) => ORDER.indexOf(a.module) - ORDER.indexOf(b.module) || a.root.startedAt.localeCompare(b.root.startedAt));
}

function versionLabel(job: ExportJob, index: number) {
  return index === 0 ? "original" : job.input.reviseJobId ? `revision-${index}` : `version-${index + 1}`;
}

/** The documents a bundle leads with: the latest version of each step and each copy piece. */
export function latestDocs(jobs: ExportJob[]): ExportDoc[] {
  let copyIndex = 0;
  return documentGroups(jobs).map((g) => {
    const latest = g.versions[g.versions.length - 1];
    const meta = STEP_META[g.module];
    const copyName = g.module === "copy" ? `${++copyIndex}-${slugify(g.root.input.copy?.format ?? "copy")}` : "";
    return {
      module: g.module,
      file: g.module === "copy" ? `${meta.num}-copy-${copyName}` : `${meta.num}-${meta.slug}`,
      title: g.module === "copy" ? `${meta.name}: ${g.root.input.copy?.format ?? `piece ${copyIndex}`}` : meta.name,
      markdown: cleanMarkdown(latest.output!),
      version: versionLabel(latest, g.versions.length - 1),
      createdAt: latest.startedAt,
    };
  });
}

export function stepDoc(job: ExportJob, all: ExportJob[]): ExportDoc {
  const group = documentGroups(all).find((g) => g.versions.some((v) => v.id === job.id));
  const index = group ? group.versions.findIndex((v) => v.id === job.id) : 0;
  const meta = STEP_META[job.module];
  const format = group?.root.input.copy?.format;
  const base = job.module === "copy" ? `${meta.num}-copy-${slugify(format ?? "copy")}` : `${meta.num}-${meta.slug}`;
  const version = versionLabel(job, index);
  return {
    module: job.module,
    file: index === 0 ? base : `${base}-${version}`,
    title: job.module === "copy" && format ? `${meta.name}: ${format}` : meta.name,
    markdown: cleanMarkdown(job.output ?? ""),
    version,
    createdAt: job.startedAt,
  };
}

// --- PDF ---

/** jsPDF's built-in Helvetica covers Latin-1 only, so typographic characters are mapped to plain equivalents. */
export function pdfText(s: string) {
  return s
    .replace(/[‘’‛′]/gu, "'")
    .replace(/[“”‟″]/gu, '"')
    .replace(/[–—−]/gu, "-")
    .replace(/…/gu, "...")
    .replace(/[•●▪]/gu, "-")
    .replace(/[→⇒]/gu, "->")
    .replace(/[←]/gu, "<-")
    .replace(/[✓✔]/gu, "[x]")
    .replace(/\u00A0/gu, " ")
    .replace(/[^\n\t -~¡-ÿ]/gu, "");
}

const inlinePlain = (s: string) =>
  pdfText(
    s
      .replace(/\*\*([^*]+)\*\*/gu, "$1")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/gu, "$1$2")
      .replace(/`([^`]+)`/gu, "$1")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gu, "$1 ($2)"),
  );

const INK: [number, number, number] = [36, 36, 38];
const MUTED: [number, number, number] = [98, 94, 87];
const RUST: [number, number, number] = [182, 63, 37];
const LINE: [number, number, number] = [215, 210, 199];

class PdfWriter {
  doc = new jsPDF({ unit: "pt", format: "letter" });
  left = 54;
  width = 612 - 108;
  y = 64;
  bottom = 792 - 60;
  footer: string;

  constructor(footer: string) {
    this.footer = pdfText(footer);
    this.paintPage();
  }

  paintPage() {
    this.doc.setFillColor(244, 241, 233);
    this.doc.rect(0, 0, 612, 792, "F");
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.doc.setTextColor(...MUTED);
    this.doc.text(this.footer, this.left, 792 - 30);
    this.doc.text(`GrowthCast  ${this.doc.getNumberOfPages()}`, 612 - this.left, 792 - 30, { align: "right" });
  }

  newPage() {
    this.doc.addPage();
    this.paintPage();
    this.y = 64;
  }

  ensure(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }

  text(content: string, { size = 10.5, bold = false, mono = false, color = INK, indent = 0, gap = 4, lineHeight = 1.45 }: { size?: number; bold?: boolean; mono?: boolean; color?: [number, number, number]; indent?: number; gap?: number; lineHeight?: number } = {}) {
    this.doc.setFont(mono ? "courier" : "helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    const lines = this.doc.splitTextToSize(content, this.width - indent) as string[];
    for (const line of lines) {
      this.ensure(size * lineHeight);
      this.doc.text(line, this.left + indent, this.y + size);
      this.y += size * lineHeight;
    }
    this.y += gap;
  }

  rule() {
    this.ensure(12);
    this.doc.setDrawColor(...LINE);
    this.doc.line(this.left, this.y + 4, this.left + this.width, this.y + 4);
    this.y += 12;
  }

  table(rows: string[][]) {
    const cols = Math.max(...rows.map((r) => r.length));
    const colWidth = this.width / cols;
    const size = cols > 5 ? 7.5 : 8.5;
    rows.forEach((row, r) => {
      this.doc.setFont("helvetica", r === 0 ? "bold" : "normal");
      this.doc.setFontSize(size);
      const cells = Array.from({ length: cols }, (_, c) => this.doc.splitTextToSize(inlinePlain(row[c] ?? ""), colWidth - 8) as string[]);
      const height = Math.max(...cells.map((c) => c.length)) * size * 1.3 + 8;
      this.ensure(height);
      if (r === 0) {
        this.doc.setFillColor(235, 231, 221);
        this.doc.rect(this.left, this.y, this.width, height, "F");
      }
      this.doc.setDrawColor(...LINE);
      this.doc.setTextColor(...INK);
      cells.forEach((lines, c) => {
        const x = this.left + c * colWidth;
        this.doc.rect(x, this.y, colWidth, height);
        lines.forEach((line, i) => this.doc.text(line, x + 4, this.y + 4 + size + i * size * 1.3));
      });
      this.y += height;
    });
    this.y += 8;
  }

  markdown(md: string) {
    const lines = cleanMarkdown(md).split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/u.test(line)) {
        const body: string[] = [];
        for (i++; i < lines.length && !/^```\s*$/u.test(lines[i]); i++) body.push(lines[i]);
        i++;
        this.text(pdfText(body.join("\n")), { size: 9, mono: true, gap: 8 });
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/u);
      if (h) {
        const level = h[1].length;
        if (level <= 2) this.y += 6;
        this.ensure(40);
        this.text(inlinePlain(h[2]), { size: level === 1 ? 20 : level === 2 ? 15 : level === 3 ? 12.5 : 11, bold: true, gap: level <= 2 ? 6 : 3 });
        i++;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/u.test(line)) {
        this.rule();
        i++;
        continue;
      }
      if (/^\s*\|/u.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/u.test(lines[i + 1])) {
        const split = (row: string) => row.trim().replace(/^\||\|$/gu, "").split("|").map((c) => c.trim());
        const rows = [split(line)];
        for (i += 2; i < lines.length && /^\s*\|/u.test(lines[i]); i++) rows.push(split(lines[i]));
        this.table(rows);
        continue;
      }
      if (/^\s*>/u.test(line)) {
        const body: string[] = [];
        for (; i < lines.length && /^\s*>/u.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/u, ""));
        this.text(inlinePlain(body.join(" ")), { color: MUTED, indent: 14, gap: 6 });
        continue;
      }
      const list = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/u);
      if (list) {
        const marker = /\d/u.test(list[2]) ? list[2] : "-";
        const indent = Math.min(3, Math.floor(list[1].length / 2)) * 12;
        this.text(`${marker}  ${inlinePlain(list[3])}`, { indent: 10 + indent, gap: 2 });
        i++;
        continue;
      }
      if (!line.trim()) {
        this.y += 4;
        i++;
        continue;
      }
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\||\s*>|\s*([-*]|\d+\.)\s)/u.test(lines[i]); i++) para.push(lines[i]);
      if (!para.length) para.push(lines[i++]);
      this.text(inlinePlain(para.join(" ")), { gap: 6 });
    }
  }

  cover(run: ExportRun, title: string, subtitle: string) {
    this.text("GROWTHCAST  POSITIONING WIZARD", { size: 9, color: RUST, gap: 18 });
    this.text(pdfText(title), { size: 30, bold: true, lineHeight: 1.15, gap: 10 });
    this.text(pdfText(subtitle), { size: 12, color: MUTED, gap: 18 });
    const facts = [
      ["Product", run.product],
      ["Feature", run.feature || "Whole product"],
      ...(run.website ? [["Website", run.website]] : []),
      ...(run.audience ? [["Audience", run.audience]] : []),
      ...(run.icp ? [["ICP", run.icp.summary ? `${run.icp.name}: ${run.icp.summary}` : run.icp.name]] : []),
      ["Generated", new Date().toISOString().slice(0, 10)],
    ];
    for (const [k, v] of facts) {
      this.text(k.toUpperCase(), { size: 8, color: MUTED, gap: 1 });
      this.text(pdfText(v), { size: 11, gap: 8 });
    }
    this.rule();
  }
}

const runTitle = (run: ExportRun) => (run.feature ? `${run.product}: ${run.feature}` : run.product);

export function stepPdf(run: ExportRun, doc: ExportDoc) {
  const pdf = new PdfWriter(`${runTitle(run)}  |  ${doc.title}`);
  pdf.cover(run, doc.title, `Step ${STEP_META[doc.module].num} of the GrowthCast Positioning Wizard (${doc.version})`);
  pdf.markdown(doc.markdown);
  return pdf.doc;
}

export function reportPdf(run: ExportRun, docs: ExportDoc[]) {
  const pdf = new PdfWriter(`${runTitle(run)}  |  Positioning report`);
  pdf.cover(run, runTitle(run), "Positioning report: evidence, Jobs-to-be-Done, positioning, ICP guidance, and copy");
  pdf.text("CONTENTS", { size: 8, color: MUTED, gap: 4 });
  docs.forEach((d) => pdf.text(`${STEP_META[d.module].num}   ${pdfText(d.title)}`, { size: 11, gap: 3 }));
  for (const d of docs) {
    pdf.newPage();
    pdf.text(`STEP ${STEP_META[d.module].num}`, { size: 8, color: RUST, gap: 6 });
    pdf.markdown(d.markdown);
  }
  return pdf.doc;
}

// --- Bundle ---

const csvCell = (v: string) => (/[",\n]/u.test(v) ? `"${v.replace(/"/gu, '""')}"` : v);

export function sourcesCsv(evidence: ExportEvidence[]) {
  const rows = [["id", "kind", "type", "name_or_url", "note", "status", "error"]];
  let d = 0;
  let u = 0;
  for (const e of evidence) {
    rows.push([e.kind === "upload" ? `D${++d}` : `U${++u}`, e.kind === "upload" ? "document" : "link", e.urlType ?? "", e.url ?? e.name, e.note, e.status, e.error ?? ""]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function reportMarkdown(run: ExportRun, docs: ExportDoc[]) {
  const header = [
    `# ${runTitle(run)}: positioning report`,
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} with the GrowthCast Positioning Wizard.`,
    run.icp ? `\nICP: ${run.icp.name}${run.icp.summary ? `. ${run.icp.summary}` : ""}` : "",
    "",
    "## Contents",
    "",
    ...docs.map((d) => `- ${STEP_META[d.module].num} ${d.title}`),
  ].join("\n");
  const body = docs.map((d) => `\n\n---\n\n<!-- Step ${STEP_META[d.module].num}: ${d.title} -->\n\n${d.markdown.replace(/^# /mu, "## ")}`).join("");
  return `${header}${body}\n`;
}

export async function buildBundle(run: ExportRun, jobs: ExportJob[], evidence: ExportEvidence[]) {
  const docs = latestDocs(jobs);
  const zip = new JSZip();
  const folder = slugify(`${run.product} ${run.feature} positioning`);
  const root = zip.folder(folder)!;
  const groups = documentGroups(jobs);
  root.file(
    "README.md",
    [
      `# ${runTitle(run)}`,
      "",
      "Exported from the GrowthCast Positioning Wizard (https://growthcast.app/resources/positioning-wizard).",
      "",
      "## Contents",
      "",
      "- `full-report.pdf` and `full-report.md`: every step in one document",
      ...docs.map((d) => `- \`steps/${d.file}.md\` and \`.pdf\`: ${d.title} (${d.version})`),
      "- `evidence/sources.csv`: the documents and links submitted as evidence, with their status",
      "- `versions/`: every saved version, including revisions",
      "- `manifest.json`: run details and file index",
      "",
      "Findings marked as hypotheses need customer validation. Review claims and proof before publishing copy.",
      "",
    ].join("\n"),
  );
  root.file("full-report.md", reportMarkdown(run, docs));
  root.file("full-report.pdf", reportPdf(run, docs).output("arraybuffer"));
  for (const d of docs) {
    root.file(`steps/${d.file}.md`, d.markdown);
    root.file(`steps/${d.file}.pdf`, stepPdf(run, d).output("arraybuffer"));
  }
  for (const g of groups) {
    g.versions.forEach((v, i) => {
      const doc = stepDoc(v, jobs);
      root.file(`versions/${doc.file.replace(/-(original|revision-\d+|version-\d+)$/u, "")}-${versionLabel(v, i)}.md`, doc.markdown);
    });
  }
  root.file("evidence/sources.csv", sourcesCsv(evidence));
  root.file(
    "manifest.json",
    JSON.stringify(
      {
        tool: "GrowthCast Positioning Wizard",
        exportedAt: new Date().toISOString(),
        run,
        steps: docs.map((d) => ({ module: d.module, title: d.title, file: `steps/${d.file}.md`, version: d.version, createdAt: d.createdAt })),
        evidence: evidence.map((e) => ({ kind: e.kind, name: e.name, url: e.url, type: e.urlType, status: e.status })),
      },
      null,
      2,
    ),
  );
  return { zip, docs, folder };
}

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
