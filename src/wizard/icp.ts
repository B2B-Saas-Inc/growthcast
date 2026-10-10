// Shared by the browser and the server: reads the ICP candidates block that the positioning module emits.
export type IcpCandidate = { name: string; summary?: string; confidence?: string };

export function parseIcpCandidates(markdown: string | null | undefined): IcpCandidate[] {
  const match = (markdown ?? "").match(/```json\s+icp-candidates\s*\n([\s\S]*?)```/u);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string")
      .slice(0, 6)
      .map((c) => ({
        name: String(c.name).slice(0, 160),
        summary: typeof c.summary === "string" ? c.summary.slice(0, 400) : undefined,
        confidence: typeof c.confidence === "string" ? c.confidence.slice(0, 20) : undefined,
      }));
  } catch {
    return [];
  }
}
