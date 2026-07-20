FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
# Pin corepack's cache to a shared, world-readable path (not root's $HOME) so the
# unprivileged `node` user in the runtime stage runs the pinned pnpm from cache
# instead of re-downloading it from the network on container start.
ENV COREPACK_HOME=/pnpm/corepack
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ARG VITE_AUTH0_CALLBACK_URL
ARG VITE_AUTH0_ROLES_CLAIM
ARG VITE_API_BASE_URL
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN
ENV VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID
ENV VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
ENV VITE_AUTH0_CALLBACK_URL=$VITE_AUTH0_CALLBACK_URL
ENV VITE_AUTH0_ROLES_CLAIM=$VITE_AUTH0_ROLES_CLAIM
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm db:generate
RUN pnpm build

# Production-only dependencies for the server (and its workspace deps), with the
# Prisma client generated into them. Excludes the web app's deps and every dev
# tool (tsup/tsx/vitest/typescript/@types/*), shrinking what ships to runtime.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --prod --frozen-lockfile --filter "@itatti/server..."
COPY packages/server/prisma packages/server/prisma
RUN pnpm --filter @itatti/server db:generate

FROM base AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache curl
WORKDIR /app
# Pruned production node_modules + manifests + Prisma schema/client, owned by the
# built-in unprivileged `node` user. Dropping root means a compromise in a
# dependency that parses untrusted uploads lands unprivileged; shipping only prod
# deps (no source, no build toolchain) shrinks the attack surface further.
COPY --from=prod-deps --chown=node:node /app ./
# Built artifacts only — the compiled server bundle and the static web app.
COPY --from=build --chown=node:node /app/packages/server/dist ./packages/server/dist
COPY --from=build --chown=node:node /app/packages/web/dist ./packages/web/dist
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["pnpm", "--filter", "@itatti/server", "start"]
