#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# DeploySimu.sh — Mise à jour et déploiement du Simulateur PRS (PM2 / sans Docker)
# Usage : bash ~/simulateur/DeploySimu.sh
#
# Pipeline (idempotent) :
#   0. sanity checks (.env présent, variables requises non vides)
#   1. git pull
#   2. npm ci               (reproductible — drop node_modules si drift)
#   3. migrations Drizzle   (schéma SQLite à jour)
#   4. rm -rf .next && npm run build
#   5. pm2 restart / start  (rolling)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="$HOME/simulateur"
PM2_NAME="simulateur"

cd "$APP_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Déploiement — Simulateur PRS           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 0. Sanity checks ──────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "✗ .env manquant dans $APP_DIR"
    echo "  Créer le fichier (cf. section PM2-prod de .env.example) avant de relancer."
    exit 1
fi

# Charger les variables .env pour l'étape migrations (qui ne passe PAS par Next).
# set -a : toute variable assignée est automatiquement exportée.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DATABASE_URL:?DATABASE_URL manquant dans .env}"
: "${SESSION_SECRET:?SESSION_SECRET manquant dans .env}"
if [ "${#SESSION_SECRET}" -lt 32 ]; then
    echo "✗ SESSION_SECRET doit faire au moins 32 caractères (générer avec: openssl rand -hex 32)"
    exit 1
fi

# ── 1. Git pull ───────────────────────────────────────────────────────────────
echo "▶ [1/5] Récupération des mises à jour (git pull)..."
git pull
echo "   ✓ Code mis à jour"
echo ""

# ── 2. Dépendances (npm ci : lock strict, wipe node_modules) ─────────────────
echo "▶ [2/5] Installation des dépendances (npm ci)..."
npm ci --prefer-offline --no-audit --no-fund
echo "   ✓ Dépendances OK"
echo ""

# ── 3. Migrations SQLite (idempotentes) ──────────────────────────────────────
echo "▶ [3/5] Migrations Drizzle..."
node scripts/migrate.mjs
echo ""

# ── 4. Build Next.js ──────────────────────────────────────────────────────────
echo "▶ [4/5] Build de production (next build)..."
rm -rf .next
npm run build
echo "   ✓ Build réussi"
echo ""

# ── 5. PM2 restart/start ──────────────────────────────────────────────────────
echo "▶ [5/5] (Re)démarrage de l'application (PM2)..."

if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
    # --update-env : force PM2 à relire l'env courant (déjà sourcé plus haut)
    # pour les vars qui auraient été ajoutées/modifiées dans .env entre 2 deploys.
    pm2 restart "$PM2_NAME" --update-env
    echo "   ✓ Application redémarrée"
else
    # Premier démarrage : PM2 hérite de l'env courant (.env déjà sourcé).
    pm2 start npm --name "$PM2_NAME" -- start
    pm2 save
    echo "   ✓ Application démarrée"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓  Déploiement terminé                      ║"
echo "║     https://simulateur.apps-reseau.fr        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

pm2 list
