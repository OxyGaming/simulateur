#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# DeploySimu.sh — Mise à jour et déploiement du Simulateur PRS
# Usage : bash DeploySimu.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

APP_DIR="$HOME/simulateur"
PM2_NAME="simulateur"
PORT=3002

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Déploiement — Simulateur PRS           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Récupérer les dernières modifications ──────────────────────────────────
echo "▶ [1/4] Récupération des mises à jour (git pull)..."
cd "$APP_DIR"
git pull
echo "   ✓ Code mis à jour"
echo ""

# ── 2. Installer les dépendances si package.json a changé ────────────────────
echo "▶ [2/4] Vérification des dépendances (npm install)..."
npm install --prefer-offline
echo "   ✓ Dépendances OK"
echo ""

# ── 3. Build de production ────────────────────────────────────────────────────
echo "▶ [3/4] Build de production (next build)..."
# Suppression du cache Next.js pour forcer un build propre
rm -rf .next
npm run build
echo "   ✓ Build réussi"
echo ""

# ── 4. Redémarrer l'application ───────────────────────────────────────────────
echo "▶ [4/4] Redémarrage de l'application (PM2)..."

if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
    pm2 restart "$PM2_NAME"
    echo "   ✓ Application redémarrée"
else
    PORT=$PORT pm2 start npm --name "$PM2_NAME" -- start
    pm2 save
    echo "   ✓ Application démarrée sur le port $PORT"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓  Déploiement terminé                      ║"
echo "║     https://simulateur.apps-reseau.fr        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

pm2 list
