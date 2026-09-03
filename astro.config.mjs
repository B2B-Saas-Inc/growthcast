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
        "font-src 'self' https://vercel.live https://assets.vercel.com",
        "img-src 'self' data: blob: https://vercel.live https://vercel.com",
        "connect-src 'self' https://cloudflareinsights.com https://*.posthog.com https://vercel.live wss://ws-us3.pusher.com",
        "frame-src https://vercel.live",
        "worker-src 'self' blob: data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", "https://static.cloudflareinsights.com", "https://*.posthog.com", "https://vercel.live"],
      },
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'", "https://vercel.live"],
      },
    },
  },
  vite: {
    server: { host: "127.0.0.1", port: 4173 },
  },
});
