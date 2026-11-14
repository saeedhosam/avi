# syntax=docker/dockerfile:1.7

# AeroQuest unified monorepo image. Two targets share one pruner:
#   docker build --target web -t avi-web .
#   docker build --target api -t avi-api .
#
# `turbo prune` keeps each target's install to its actual dependency graph, so
# the web image does not ship the Fastify gateway and the API image does not
# ship Next.js.

FROM node:24-bookworm-slim AS pruner
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate \
  && npm install --global turbo@2.11.10
WORKDIR /repo
COPY . .
RUN turbo prune @avi/web --docker --out-dir /out/web \
  && turbo prune @avi/api --docker --out-dir /out/api

# ── API / gateway ────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS api-build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /repo

COPY --from=pruner /out/api/json/ ./
COPY --from=pruner /out/api/full/ ./
COPY --from=pruner /repo/tsconfig.base.json ./tsconfig.base.json
RUN pnpm config set fetch-timeout 300000 --location=project \
  && pnpm config set fetch-retries 5 --location=project \
  && pnpm install --frozen-lockfile
RUN pnpm --filter @avi/shared build \
  && pnpm --filter @avi/contracts build \
  && pnpm --filter @avi/api build
RUN pnpm --filter @avi/api deploy --prod --legacy /prod/api
# `pnpm deploy` may leave workspace dependencies as symlinks into /repo; the
# runtime stage copies only /prod/api, so materialize the real packages.
RUN rm -rf /prod/api/node_modules/@avi/catalog /prod/api/node_modules/@avi/contracts /prod/api/node_modules/@avi/shared \
  && cp -r /repo/packages/catalog /prod/api/node_modules/@avi/catalog \
  && cp -r /repo/packages/contracts /prod/api/node_modules/@avi/contracts \
  && cp -r /repo/packages/shared /prod/api/node_modules/@avi/shared

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=api-build --chown=node:node /prod/api ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

# ── Web ──────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS web-build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /repo

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG AVI_API_BASE_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV AVI_API_BASE_URL=$AVI_API_BASE_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

COPY --from=pruner /out/web/json/ ./
COPY --from=pruner /out/web/full/ ./
COPY --from=pruner /repo/tsconfig.base.json ./tsconfig.base.json
RUN pnpm config set fetch-timeout 300000 --location=project \
  && pnpm config set fetch-retries 5 --location=project \
  && pnpm install --frozen-lockfile
RUN pnpm --filter @avi/shared build \
  && pnpm --filter @avi/contracts build \
  && pnpm --filter @avi/ui build
# The web prebuild copies this shared MapLibre style into public/map. The
# package is not a runtime dependency, so turbo prune does not include it.
COPY --from=pruner /repo/packages/map-style ./packages/map-style
RUN pnpm --filter @avi/web build

FROM node:24-bookworm-slim AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
