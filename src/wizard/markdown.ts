// Small Markdown renderer for Positioning Wizard documents. All input is HTML-escaped before formatting, and only
// http(s) links are produced, so model output can never inject markup or scripts.
const esc = (s: string) => s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/gu, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gu, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<|]+)/gu, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
}

const cells = (row: string) => row.trim().replace(/^\||\|$/gu, "").split("|").map((c) => c.trim());

export function renderMarkdown(src: string, { hideFence }: { hideFence?: RegExp } = {}) {
  const lines = src.replace(/\r/gu, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(.*)$/u);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/u.test(lines[i]); i++) body.push(lines[i]);
      i++;
      if (!(hideFence && hideFence.test(fence[1]))) out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/u);
    if (h) {
      const level = Math.min(4, h[1].length + 1); // the page owns h1
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/u.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }
    if (/^\s*\|/u.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/u.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/u.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(
        `<div class="wzTable"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (/^\s*>/u.test(line)) {
      const body: string[] = [];
      for (; i < lines.length && /^\s*>/u.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/u, ""));
      out.push(`<blockquote>${inline(body.join(" "))}</blockquote>`);
      continue;
    }
    const list = line.match(/^\s*([-*]|\d+\.)\s+/u);
    if (list) {
      const tag = /\d/u.test(list[1]) ? "ol" : "ul";
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/u.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/u, ""));
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\||\s*>|\s*([-*]|\d+\.)\s)/u.test(lines[i]); i++) para.push(lines[i]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}
