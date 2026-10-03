# ---- build stage: full toolchain (typescript, vite, vitest, testing libs) ----
# Base pinned to the amd64 digest validated on this stack (Phase 7); re-pin per
# architecture if deploying on arm64.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: serve the static SPA with `vite preview`, which proxies
#      /api to the API service (ERC_PREVIEW_PROXY_TARGET) so the browser stays
#      same-origin and session/CSRF cookies never cross origins ----
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# `vite preview` reads vite.config.ts at startup for the /api proxy target.
COPY vite.config.ts ./

EXPOSE 5173

CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port 5173"]