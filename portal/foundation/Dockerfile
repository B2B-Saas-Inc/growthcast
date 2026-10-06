FROM oven/bun:1.3.9@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS schema
WORKDIR /upstream
COPY upstream/ ./
RUN bun install --frozen-lockfile
COPY foundation/migrations/ /reviewed/
RUN packages/database/node_modules/.bin/prisma migrate diff --from-empty --to-schema-datamodel packages/database/prisma/schema.prisma --script > /generated.sql
RUN bun -e 'const fs=require("fs"),crypto=require("crypto"),hash=x=>crypto.createHash("sha256").update(x).digest("hex");const m=JSON.parse(fs.readFileSync("/reviewed/manifest.json"));if(hash(fs.readFileSync("packages/database/prisma/schema.prisma"))!==m.prismaSchemaSha256||hash(fs.readFileSync("/generated.sql"))!==m.migrations[0].sha256)throw Error("Reviewed baseline differs from pinned schema");'
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS foundation
WORKDIR /foundation
COPY gateway/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY gateway/src/ /foundation/src/
COPY foundation/ ./
COPY --from=schema /generated.sql /foundation/provenance/atrium-baseline.sql
USER node
CMD ["node", "check.mjs", "guard"]

FROM schema AS application
RUN bun run --filter @atrium/database db:generate && bun run --filter @atrium/email build && bun run --filter @atrium/api build
COPY --from=foundation /foundation /foundation
COPY adapters/ /upstream/apps/api/
COPY --from=foundation /foundation /upstream/gateway
COPY foundation/application.check.mjs /upstream/apps/api/application.check.mjs
USER bun
CMD ["bun", "/foundation/application-env.mjs", "bun", "/upstream/apps/api/application.check.mjs"]
