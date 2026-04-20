#!/bin/sh
# Point d'entrée du conteneur applicatif.
# 1. Applique les migrations Drizzle (idempotent — drizzle skip les migrations déjà appliquées).
# 2. Lance le serveur Next.js standalone.
set -e

echo "[entrypoint] applying migrations..."
node scripts/migrate.mjs

echo "[entrypoint] starting Next.js server on 0.0.0.0:${PORT:-3000}..."
exec node server.js
