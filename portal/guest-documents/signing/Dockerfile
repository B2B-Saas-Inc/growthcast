FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /deps
COPY guest-documents/signing/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM growthcast-foundation
USER root
RUN apk add --no-cache openssl
USER node
COPY --from=dependencies /deps/node_modules /foundation/node_modules
COPY gateway/src /foundation/gateway/src
COPY deployment/supabase-config.mjs /foundation/deployment/supabase-config.mjs
COPY deployment/runtime/config.mjs /foundation/deployment/runtime/config.mjs
COPY deployment/supabase/managed-atrium/migrate.mjs /foundation/deployment/supabase/managed-atrium/migrate.mjs
