# Build stage
FROM node:20-alpine AS builder

# Enable pnpm via corepack (ships with Node 16.13+)
RUN corepack enable

WORKDIR /app

# Copy lockfile + manifest + npmrc (engine-strict=false + @poukai-inc registry)
COPY package.json pnpm-lock.yaml .npmrc ./

# NPM_TOKEN — GitHub PAT with read:packages, passed via build secret.
# Required to install @poukai-inc/* from GitHub Packages.
# See docs/setup-npm-token.md.
ARG NPM_TOKEN

# Install dependencies — frozen lockfile enforces R-066
RUN --mount=type=secret,id=npm_token,env=NPM_TOKEN \
    NPM_TOKEN="${NPM_TOKEN:-$(cat /run/secrets/npm_token 2>/dev/null || true)}" \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install ffmpeg for video processing
RUN apk add --no-cache ffmpeg

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
