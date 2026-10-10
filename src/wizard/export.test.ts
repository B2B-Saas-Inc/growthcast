import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildBundle, cleanMarkdown, documentGroups, latestDocs, pdfText, reportPdf, sourcesCsv, stepDoc, stepPdf, type ExportJob } from "./export";

let t = 0;
const job = (module: ExportJob["module"], output: string, input: ExportJob["input"] = {}, id = `j${++t}`): ExportJob => ({
  id,
  module,
  status: "succeeded",
  input,
  output,
  startedAt: new Date(Date.UTC(2026, 9, 10, 0, t)).toISOString(),
});

const run = { product: "Acme Billing", feature: "Usage invoicing", website: "https://acme.example", audience: "", icp: { name: "Finance lead", summary: "Moving to usage pricing." } };
const positioning = "# Positioning\n\nLead with finance leads.\n\n```json icp-candidates\n[{\"name\":\"Finance lead\"}]\n```\n";

function fixture() {
  const research = job("research", "# Research notes\n\n> “Invoices were wrong” [D1]");
  const jtbd = job("jtbd", "# JTBD\n\n| Job | Confidence |\n|---|---|\n| Bill accurately | Medium |");
  const jtbdRev = job("jtbd", "# JTBD revised", { reviseJobId: jtbd.id });
  const pos = job("positioning", positioning);
  const pmm = job("pmm", "# Guidance\n\n- Pillar: accuracy");
  const ad = job("copy", "# LinkedIn ads", { copy: { format: "LinkedIn" } });
  const hero = job("copy", "# Hero", { copy: { format: "Homepage hero" } });
  const adRev = job("copy", "# LinkedIn ads v2", { reviseJobId: ad.id });
  const adRev2 = job("copy", "# LinkedIn ads v3", { reviseJobId: adRev.id });
  const failed: ExportJob = { ...job("positioning", ""), status: "failed", output: null };
  return { jobs: [research, jtbd, jtbdRev, pos, pmm, ad, hero, adRev, adRev2, failed], jtbd, jtbdRev, ad, adRev2 };
}

describe("document grouping", () => {
  it("groups revisions (including revisions of revisions) under their original document", () => {
    const { jobs } = fixture();
    const groups = documentGroups(jobs);
    expect(groups.map((g) => g.module)).toEqual(["research", "jtbd", "positioning", "pmm", "copy", "copy"]);
    const linkedin = groups.find((g) => g.root.input.copy?.format === "LinkedIn")!;
    expect(linkedin.versions.map((v) => v.output)).toEqual(["# LinkedIn ads", "# LinkedIn ads v2", "# LinkedIn ads v3"]);
  });

  it("leads the bundle with the latest version of each document", () => {
    const docs = latestDocs(fixture().jobs);
    expect(docs.map((d) => d.file)).toEqual(["00-research-notes", "01-jobs-to-be-done", "02-positioning", "03-icp-guidance", "04-copy-1-linkedin", "04-copy-2-homepage-hero"]);
    expect(docs[1].markdown).toContain("JTBD revised");
    expect(docs[1].version).toBe("revision-1");
    expect(docs[4].markdown).toContain("v3");
  });

  it("names a single-step export by its version", () => {
    const { jobs, jtbd, jtbdRev, adRev2 } = fixture();
    expect(stepDoc(jtbd, jobs).file).toBe("01-jobs-to-be-done");
    expect(stepDoc(jtbdRev, jobs).file).toBe("01-jobs-to-be-done-revision-1");
    expect(stepDoc(adRev2, jobs).title).toBe("Copy: LinkedIn");
  });
});

describe("content cleanup", () => {
  it("removes the internal ICP block from exports", () => {
    expect(cleanMarkdown(positioning)).not.toContain("icp-candidates");
    expect(cleanMarkdown(positioning)).toContain("Lead with finance leads.");
  });

  it("maps typographic characters to Latin-1 for PDF fonts", () => {
    expect(pdfText("“Quote” — it’s… → ✓ ✨")).toBe('"Quote" - it\'s... -> [x] ');
    expect(pdfText("café")).toBe("café");
  });

  it("escapes CSV cells and labels sources like the research notes", () => {
    const csv = sourcesCsv([
      { kind: "upload", name: "call, part 1.txt", url: null, urlType: null, note: "", status: "ready", error: null },
      { kind: "url", name: "u", url: "https://g2.com/x", urlType: "Customer review", note: 'said "wrong"', status: "failed", error: "HTTP 403" },
    ]);
    expect(csv).toContain('D1,document,,"call, part 1.txt",,ready,');
    expect(csv).toContain('U1,link,Customer review,https://g2.com/x,"said ""wrong""",failed,HTTP 403');
  });
});

describe("PDF and bundle", () => {
  it("renders step and report PDFs", () => {
    const { jobs, jtbd } = fixture();
    const step = stepPdf(run, stepDoc(jtbd, jobs));
    expect(step.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(new TextDecoder().decode(step.output("arraybuffer").slice(0, 5))).toBe("%PDF-");
    expect(reportPdf(run, latestDocs(jobs)).getNumberOfPages()).toBeGreaterThan(5);
  });

  it("bundles steps, report, sources, versions and a manifest", async () => {
    const { jobs } = fixture();
    const { zip, folder } = await buildBundle(run, jobs, [{ kind: "url", name: "x", url: "https://acme.example", urlType: "Our own page", note: "", status: "ready", error: null }]);
    const reopened = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }));
    const names = Object.keys(reopened.files).filter((n) => !n.endsWith("/")).map((n) => n.slice(folder.length + 1)).sort();
    expect(folder).toBe("acme-billing-usage-invoicing-positioning");
    expect(names).toEqual(expect.arrayContaining([
      "README.md", "full-report.md", "full-report.pdf", "manifest.json", "evidence/sources.csv",
      "steps/00-research-notes.md", "steps/00-research-notes.pdf", "steps/02-positioning.pdf", "steps/04-copy-1-linkedin.md",
      "versions/01-jobs-to-be-done-original.md", "versions/01-jobs-to-be-done-revision-1.md", "versions/04-copy-linkedin-revision-2.md",
    ]));
    const report = await reopened.file(`${folder}/full-report.md`)!.async("string");
    expect(report).not.toContain("icp-candidates");
    expect(report.indexOf("Research notes")).toBeLessThan(report.indexOf("LinkedIn ads v3"));
    const manifest = JSON.parse(await reopened.file(`${folder}/manifest.json`)!.async("string"));
    expect(manifest.steps).toHaveLength(6);
  });
});
