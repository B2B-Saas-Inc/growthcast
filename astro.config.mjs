import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://growthcast.app",
  output: "static",
  integrations: [react(), sitemap()],
  markdown: { syntaxHighlight: false },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "font-src 'self'",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://cloudflareinsights.com https://*.posthog.com",
        "worker-src 'self' blob: data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", "https://static.cloudflareinsights.com", "https://*.posthog.com"],
      },
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },
  vite: {
    server: { host: "127.0.0.1", port: 4173 },
  },
});
