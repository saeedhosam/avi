# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/src packages/contracts/src
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/scripts packages/contracts/scripts
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/catalog/airports.json packages/catalog/airports.json
COPY packages/catalog/terminal-layouts.json packages/catalog/terminal-layouts.json
COPY packages/catalog/world_countries.json packages/catalog/world_countries.json
COPY packages/map-style/package.json packages/map-style/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY services/api/package.json services/api/package.json

RUN pnpm install --frozen-lockfile --filter @avi/api...
# Build the shared contract package first (the api imports its types+mapper).
RUN pnpm --filter @avi/contracts build

COPY services/api services/api
COPY packages/catalog/ packages/catalog/
RUN pnpm --filter @avi/api build

RUN pnpm --filter @avi/api deploy --prod --legacy /prod/api

# `pnpm deploy` may materialize workspace deps as symlinks into the repo tree;
# make the workspace packages real directories inside the produced bundle so
# the runtime stage (which copies only /prod/api) resolves their dist assets.
RUN rm -rf /prod/api/node_modules/@avi/catalog \
  && cp -r /repo/packages/catalog /prod/api/node_modules/@avi/catalog
RUN rm -rf /prod/api/node_modules/@avi/contracts \
  && cp -r /repo/packages/contracts /prod/api/node_modules/@avi/contracts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
