FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /app
COPY deployment/backup/job/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /app/node_modules /app/node_modules
COPY deployment/managed-recovery/restore.sh deployment/managed-recovery/verify.mjs deployment/managed-recovery/catalog.mjs /app/deployment/managed-recovery/
COPY deployment/backup/restore-objects.mjs deployment/backup/capture-core.mjs /app/deployment/backup/
COPY deployment/supabase-config.mjs /app/deployment/
COPY deployment/supabase/isolation.sql /app/deployment/supabase/
COPY deployment/supabase/managed-atrium /app/deployment/supabase/managed-atrium/
COPY deployment/supabase/managed-documenso /app/deployment/supabase/managed-documenso/
COPY deployment/backup/restore-worker/verify.sh /app/verify.sh
RUN mkdir /work /restored /objects && chown postgres:postgres /work /restored /objects
USER postgres
WORKDIR /app
ENTRYPOINT ["sh", "/app/verify.sh"]
COPY deployment/backup/restore-worker/cloud.mjs deployment/backup/restore-worker/cloud-core.mjs /app/deployment/backup/restore-worker/
COPY deployment/backup/verification/records.mjs /app/deployment/backup/verification/
USER root
RUN mkdir /input && chown postgres:postgres /input
USER postgres
VOLUME ["/input", "/work", "/restored", "/objects"]
