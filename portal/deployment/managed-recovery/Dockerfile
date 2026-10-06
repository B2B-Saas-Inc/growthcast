FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS dependencies
WORKDIR /app
COPY gateway/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /app/node_modules /app/node_modules
WORKDIR /app
ENTRYPOINT ["node"]
