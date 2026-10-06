FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
WORKDIR /app
COPY deployment/backup/job/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY deployment/backup/verification/records.mjs deployment/backup/verification/monitor.mjs ./
RUN addgroup -g 10001 monitor && adduser -D -H -u 10001 -G monitor monitor
USER 10001:10001
ENTRYPOINT ["node", "/app/monitor.mjs"]
