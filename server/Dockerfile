# ---- build stage: full toolchain (typescript, prisma CLI, dev deps) ----
# Base pinned to the amd64 digest validated on this stack (Phase 7); re-pin per
# architecture if deploying on arm64.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage: the full node_modules tree from the build stage.
#      `npm ci --omit=dev` in the runner is avoided deliberately: npm's
#      dev-pruning can drop packages the production graph needs (e.g. the
#      stream-json transitive of minio), crash-looping the app. The prisma
#      client is already generated inside the build stage's node_modules. ----
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]