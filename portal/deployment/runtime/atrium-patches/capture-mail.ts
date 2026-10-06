import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

// Staging capture is deliberately separate from real delivery configuration.
// It takes precedence over organization settings, preventing accidental sends.
export function createCapturedMail(config: ConfigService) {
  const mode = config.get<string>("PORTAL_MAIL_MODE");
  if (mode === undefined) return null;
  if (mode !== "capture" && mode !== "workspace-smtp") throw new Error("Unsupported portal mail mode");
  const host = config.get<string>("PORTAL_MAIL_CAPTURE_HOST") ?? "mail";
  if (!["mail", "127.0.0.1"].includes(host)) throw new Error("Unsupported capture host");
  const transport = nodemailer.createTransport({host, port: 1025, secure: false,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 5000});
  return async (to: string, subject: string, html: string) => {
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:invalid|test)$/.test(to)) {
      if (mode === "workspace-smtp") return null;
      throw new Error("Staging recipient denied");
    }
    await transport.sendMail({from: "portal@growthcast.invalid", to, subject, html});
    return {sent: true, viaOrgConfig: false};
  };
}
