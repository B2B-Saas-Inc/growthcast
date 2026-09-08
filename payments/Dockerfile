FROM node:22.14.0-bookworm-slim AS check
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run check && npm test
USER node
CMD ["node", "server.mjs"]
