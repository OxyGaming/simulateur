# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────────────────────────────────────
# Image Docker multi-stage pour Simulateur PRS (Next.js 15 + SQLite + Drizzle).
# - Stage "deps"    : installe TOUTES les deps + compile better-sqlite3 en natif
# - Stage "builder" : build Next.js en mode standalone
# - Stage "runner"  : image finale minimale (server standalone + binaire natif)
# On reste sur Debian slim (pas Alpine) pour la compatibilité glibc avec le
# binaire natif de better-sqlite3.
# ──────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20

# ─── Stage 1 : deps ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Outils nécessaires pour compiler better-sqlite3 (node-gyp → python + make + g++).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2 : builder ────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ─── Stage 3 : runner ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non-root (les fichiers du volume /data appartiendront à lui).
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs

# Standalone output de Next.js : contient server.js + minimal node_modules + public/static tracés.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# Migrations + scripts runtime (non inclus par Next dans standalone par défaut —
# on utilise outputFileTracingIncludes côté next.config.ts, mais on COPY aussi
# explicitement pour être robuste si le tracing loupe un fichier).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs     ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/create-user.mjs ./scripts/create-user.mjs
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

# Volume pour la base SQLite (WAL + SHM + app.db). Le chemin par défaut de
# DATABASE_URL en prod pointe ici (file:/data/app.db) — cf docker-compose.yml.
RUN mkdir -p /data && chown -R nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
