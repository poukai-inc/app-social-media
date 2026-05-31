# Build stage
FROM node:20-alpine AS builder

# Enable pnpm via corepack (ships with Node 16.13+)
RUN corepack enable

WORKDIR /app

# Copy lockfile + manifest + npmrc (engine-strict=false; future @poukai-inc registry config)
# .npmrc contains only the ${NPM_TOKEN} placeholder — never a literal token.
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies — frozen lockfile enforces R-066
# SECURITY: when @poukai-inc registry auth becomes required at build time, pass
# NPM_TOKEN via a BuildKit secret mount, NOT an ARG/ENV — an ARG bakes the token
# into image history. e.g.:
#   RUN --mount=type=secret,id=npm_token \
#       NPM_TOKEN="$(cat /run/secrets/npm_token)" pnpm install --frozen-lockfile
RUN pnpm install --frozen-lockfile

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

# Image-level liveness signal so `docker run` (outside compose) and
# `depends_on: condition: service_healthy` have something to check. (issue #39)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
