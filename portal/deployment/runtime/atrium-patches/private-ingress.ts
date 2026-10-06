import { readFileSync } from "node:fs";
import type { Request, Response, NextFunction } from "express";
import { originAuthorized } from "./portal-origin";

export function privateIngress() {
  const secret = readFileSync("/run/origin/api-origin", "utf8").trim();
  const webOrigin = process.env.WEB_URL;
  if (!webOrigin || new URL(webOrigin).origin !== webOrigin || !webOrigin.startsWith("https://")) {
    throw new Error("Canonical HTTPS web origin required");
  }
  originAuthorized({get: () => null}, secret); // Fail startup on missing/invalid credential.
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Referrer-Policy", "no-referrer");
    const localHealth = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") &&
      ["GET", "HEAD"].includes(req.method) && req.originalUrl === "/api/health";
    if (localHealth) return next();
    const count = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === "x-growthcast-origin").length;
    const supplied = req.headers["x-growthcast-origin"];
    if (count !== 1 || !originAuthorized({get: () => typeof supplied === "string" ? supplied : null}, secret) ||
      (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== webOrigin)) {
      res.status(403).send("Unavailable"); return;
    }
    next();
  };
}
