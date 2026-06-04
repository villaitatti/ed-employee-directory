FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
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

FROM base AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /app /app
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["pnpm", "--filter", "@itatti/server", "start"]
