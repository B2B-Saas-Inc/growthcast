FROM mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d
WORKDIR /recovery
COPY gateway/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY recovery/ ./
USER pwuser
CMD ["node", "verify.mjs"]
