FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS gateway
WORKDIR /gateway
COPY gateway/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY gateway/ ./
COPY foundation/ ./foundation/
FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS check
WORKDIR /app
COPY upstream/ ./
RUN bun install --frozen-lockfile
RUN bun run --filter @atrium/database db:generate && bun run --filter @atrium/email build && bun run --filter @atrium/api build
RUN packages/database/node_modules/.bin/prisma migrate diff --from-empty --to-schema-datamodel packages/database/prisma/schema.prisma --script > /app/baseline.sql
COPY compatibility.check.mjs apps/api/compatibility.check.mjs
COPY --from=gateway /gateway /app/gateway
RUN bun -e 'const fs=require("fs"),c=require("crypto"),m=JSON.parse(fs.readFileSync("/app/gateway/foundation/migrations/manifest.json"));if(c.createHash("sha256").update(fs.readFileSync("/app/baseline.sql")).digest("hex")!==m.migrations[0].sha256)throw Error("Pinned schema differs from reviewed baseline");'
COPY api-runtime.mjs api-server.mjs database-env.mjs worker-once.mjs proof.mjs http.check.mjs claims.mjs ownership.mjs catalog.mjs lifecycle-worker.mjs lifecycle.mjs completion.mjs provider-fixture.mjs apps/api/
USER bun
CMD ["bun", "/app/apps/api/database-env.mjs", "sh", "-ec", "cd apps/api && bun test ./compatibility.check.mjs && bun test ./http.check.mjs"]

FROM gateway AS gateway-http
COPY --from=gateway /gateway /app/gateway
COPY bootstrap.mjs database-env.mjs claims.mjs gateway-http.mjs provider-bridge.mjs /app/apps/api/
USER node
CMD ["node", "/app/apps/api/database-env.mjs", "node", "/app/apps/api/gateway-http.mjs"]

FROM check AS web
USER root
COPY catalog-page.tsx web-overlay.mjs /app/
RUN bun web-overlay.mjs
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --filter @atrium/web build
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
USER bun
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["bun", "apps/web/.next/standalone/apps/web/server.js"]

FROM gateway-http AS edge
COPY browser-edge.mjs /app/apps/api/
CMD ["node", "/app/apps/api/browser-edge.mjs"]

FROM mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d AS browser
WORKDIR /browser
COPY gateway/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY browser.check.mjs ./
CMD ["node", "browser.check.mjs"]
