FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY vendor/content-engine/ejwhite-content-engine-0.1.0-d4aaa9d.tgz vendor/content-engine/ejwhite-content-engine-0.1.0-d4aaa9d.tgz
RUN npm ci
COPY . .
RUN npm run content:drift && npm run content:briefs:check && npm run content:validate && npm run lint && npm test && npm run build
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
