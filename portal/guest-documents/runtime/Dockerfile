FROM documenso/documenso@sha256:615d0e79047ff9615dc86092bf9a6ba021750ee3895f440621e94477b581b183 AS provider-assets
COPY guest-documents/runtime/provider-assets.mjs /tmp/provider-assets.mjs
RUN node /tmp/provider-assets.mjs > /tmp/provider-assets.json
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /app
COPY guest-documents/signing/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
RUN apk add --no-cache openssl
COPY --from=provider-assets /tmp/provider-assets.json ./provider-assets.json
COPY guest-documents/deployment/signing-secrets/pins.json ./signing-pins.json
COPY guest-documents/*.mjs ./guest-documents/
COPY guest-documents/signing/*.mjs ./guest-documents/signing/
COPY guest-documents/catalog/*.mjs ./guest-documents/catalog/
COPY guest-documents/runtime/*.mjs ./guest-documents/runtime/
COPY gateway/src/*.mjs ./gateway/src/
COPY deployment/web-app/brand/growthcast-wordmark.png deployment/web-app/brand/growthcast-favicon-v2.jpg ./deployment/web-app/brand/
COPY deployment/web-app/brand/assets/fonts/ ./deployment/web-app/brand/assets/fonts/
COPY deployment/storage/client.mjs ./deployment/storage/
COPY deployment/supabase-config.mjs ./deployment/
COPY deployment/runtime/config.mjs ./deployment/runtime/
COPY deployment/supabase/managed-atrium/migrate.mjs ./deployment/supabase/managed-atrium/
COPY deployment/supabase/managed-atrium/migrations/ ./deployment/supabase/managed-atrium/migrations/
COPY guest-documents/schema.sql ./deployment/supabase/managed-atrium/migrations/010-guest-documents.sql
COPY guest-documents/catalog/schema.sql ./deployment/supabase/managed-atrium/migrations/011-guest-catalog.sql
COPY guest-documents/catalog/restore-stable.sql ./deployment/supabase/managed-atrium/migrations/012-catalog-restore-stable.sql
COPY guest-documents/signing/delivery.sql ./deployment/supabase/managed-atrium/migrations/013-document-delivery.sql
RUN node /app/guest-documents/runtime/prepare-manifest.mjs
RUN chmod -R a+rX /app
RUN mkdir -p /run/signing /run/gateway /run/lifecycle && chown 1000:1000 /run/signing /run/gateway /run/lifecycle && chmod 700 /run/signing /run/gateway /run/lifecycle
VOLUME ["/run/signing", "/run/gateway", "/run/lifecycle", "/tmp"]
USER node
EXPOSE 3002
ENTRYPOINT ["node", "/app/guest-documents/runtime/start.mjs"]
