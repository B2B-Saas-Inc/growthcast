// Fetches a user-submitted web page as plain text without letting it reach private networks (SSRF protection).
// Every connection, including each redirect hop, resolves DNS through a lookup that rejects non-public addresses,
// so a hostname cannot pass a check and then rebind to an internal IP.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^f[cd]/u.test(lower) || /^fe[89ab]/u.test(lower) || lower.startsWith("ff")) return false;
    if (lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8")) return false;
    return true;
  }
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
function safeLookup(hostname: string, options: object, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = (addresses as LookupAddress[]) ?? [];
    if (!list.length || list.some((entry) => !isPublicAddress(entry.address))) {
      return callback(Object.assign(new Error("That address points to a private network."), { code: "EPRIVATE" }), "");
    }
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

function get(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname.replace(/^\[|\]$/gu, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/gu, ""))) {
      return reject(new Error("That address points to a private network."));
    }
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (![80, 443].includes(port)) return reject(new Error("Only standard web ports are allowed."));
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "GrowthCastPositioningWizard/1.0 (+https://growthcast.app)",
          Accept: "text/html,text/plain,text/markdown,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new Error("The page took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

function decodeEntities(s: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', mdash: "-", ndash: "-", hellip: "..." };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.trim() ?? "");
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template|head)[\s\S]*?<\/\1>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<\/?(h[1-6])[^>]*>/giu, "\n\n")
    .replace(/<li[^>]*>/giu, "\n- ")
    .replace(/<\/(p|div|section|article|tr|li|ul|ol|blockquote|header|footer|nav|main)>/giu, "\n")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, " ");
  const text = decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n");
  return { title, text };
}

export async function fetchPageText(raw: string): Promise<{ title: string; text: string; finalUrl: string }> {
  let url = new URL(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http and https links are supported.");
    const res = await get(url);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      url = new URL(res.headers.location, url);
      continue;
    }
    if (status >= 400) {
      res.resume();
      throw new Error(`The page returned HTTP ${status}.`);
    }
    const type = String(res.headers["content-type"] ?? "").toLowerCase();
    if (type && !/text\/|application\/(xhtml\+xml|json)/u.test(type)) {
      res.resume();
      throw new Error("The link is not a web page. Upload documents as files instead.");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res) {
      size += (chunk as Buffer).length;
      if (size > MAX_BYTES) {
        res.destroy();
        break;
      }
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const parsed = type.includes("html") || /<html|<body/iu.test(body.slice(0, 2000)) ? htmlToText(body) : { title: "", text: body.trim() };
    if (parsed.text.length < 40) throw new Error("The page had no readable text (it may require JavaScript or a login).");
    return { ...parsed, finalUrl: url.toString() };
  }
  throw new Error("The link redirected too many times.");
}
