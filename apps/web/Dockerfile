# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /repo

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG AVI_API_BASE_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV AVI_API_BASE_URL=$AVI_API_BASE_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/src packages/contracts/src
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/scripts packages/contracts/scripts
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/scripts packages/shared/scripts
COPY packages/ui/package.json packages/ui/package.json
COPY packages/ui/src packages/ui/src
COPY packages/ui/tsconfig.json packages/ui/tsconfig.json
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/catalog/airports.json packages/catalog/airports.json
COPY packages/catalog/terminal-layouts.json packages/catalog/terminal-layouts.json
COPY packages/catalog/world_countries.json packages/catalog/world_countries.json
COPY packages/map-style/package.json packages/map-style/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY services/api/package.json services/api/package.json

RUN pnpm install --frozen-lockfile --filter @avi/web...
# Workspace packages are consumed from source/dist through symlinks; build the
# shared package + contract + 3D UI dist before the web bundle.
RUN pnpm --filter @avi/shared build \
  && pnpm --filter @avi/contracts build \
  && pnpm --filter @avi/ui build

COPY apps/web apps/web
COPY packages packages
RUN pnpm --filter @avi/shared build \
  && pnpm --filter @avi/contracts build \
  && pnpm --filter @avi/ui build \
  && pnpm --filter @avi/web build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
