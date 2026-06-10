# Multistage build for the Mighty Sweet Cookies Hono API.
# Output: a slim Node 22 image running `node dist/index.js`.
#
# Build context = this directory (no workspace files needed).
# Build: docker build -t msc-api .
# Run:   docker run -p 3000:3000 --env-file .env msc-api

# ---------------------------------------------------------------------------
# Build stage: install all deps + compile TypeScript
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev deps for the runtime layer
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Runtime stage: just node + compiled output + prod deps
# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck needs wget; alpine has it built-in but slim does not.
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system --gid 1001 msc && \
    useradd --system --uid 1001 --gid msc --no-create-home msc

COPY --from=builder --chown=msc:msc /app/node_modules ./node_modules
COPY --from=builder --chown=msc:msc /app/dist ./dist
COPY --from=builder --chown=msc:msc /app/package.json ./package.json

USER msc

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
