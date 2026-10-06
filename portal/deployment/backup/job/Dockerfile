FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /app
COPY deployment/backup/job/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /app/node_modules /app/node_modules
COPY deployment/backup/job/core.mjs deployment/backup/job/main.mjs deployment/backup/job/configuration.json /app/deployment/backup/job/
COPY deployment/backup/capture.mjs deployment/backup/capture-core.mjs /app/deployment/backup/
COPY deployment/supabase-config.mjs /app/deployment/
COPY deployment/storage/client.mjs /app/deployment/storage/
COPY deployment/managed-recovery/catalog.mjs /app/deployment/managed-recovery/
COPY deployment/supabase/managed-atrium/migrate.mjs /app/deployment/supabase/managed-atrium/
COPY deployment/supabase/managed-atrium/migrations /app/deployment/supabase/managed-atrium/migrations/
COPY deployment/supabase/managed-documenso/migrate.mjs deployment/supabase/managed-documenso/fingerprint.mjs deployment/supabase/managed-documenso/manifest.json /app/deployment/supabase/managed-documenso/
COPY deployment/supabase/managed-documenso/migrations /app/deployment/supabase/managed-documenso/migrations/
RUN addgroup -g 10001 backup && adduser -D -H -u 10001 -G backup backup && mkdir /work && chown backup:backup /work
USER 10001:10001
VOLUME ["/work"]
WORKDIR /app
ENTRYPOINT ["node", "/app/deployment/backup/job/main.mjs"]
