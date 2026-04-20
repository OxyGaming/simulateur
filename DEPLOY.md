# Déploiement self-hosted — VPS OVH

Ce document décrit le déploiement du Simulateur PRS sur un VPS Linux (Debian 12 /
Ubuntu 22.04+) avec Docker Compose, Caddy (HTTPS automatique) et Litestream
(sauvegarde SQLite continue).

Architecture :

```
         ┌────────────────────────┐
         │  Internet (443/tcp)    │
         └───────────┬────────────┘
                     │
                ┌────▼─────┐
                │  Caddy   │  TLS auto (Let's Encrypt)
                └────┬─────┘
                     │  reverse_proxy app:3000
                ┌────▼─────┐
                │   app    │  Next.js standalone + better-sqlite3
                └────┬─────┘
                     │  WAL / SHM / app.db
                ┌────▼──────────────┐
                │  volume app-data  │◄──── litestream replicate
                └───────────────────┘       ▲
                                            │
                               /backups (volume) + (option) S3
```

---

## 1. Prérequis VPS

### Côté OVH

- Un **VPS** ou **Public Cloud Instance** sous Debian 12 / Ubuntu 22.04+ (1 vCPU,
  2 Go RAM suffisent largement pour un usage pédagogique).
- Un **nom de domaine** ou sous-domaine pointant vers l'IP publique du VPS
  (enregistrement **A** pour IPv4, **AAAA** pour IPv6). La propagation DNS doit
  être effective avant de lancer Caddy, sinon la validation Let's Encrypt échoue.

### Sur le VPS (à faire une fois)

```sh
# Utilisateur non-root avec sudo — créer si besoin
adduser deploy
usermod -aG sudo deploy

# Mises à jour système
sudo apt update && sudo apt upgrade -y

# Outils de base
sudo apt install -y git curl ca-certificates

# Docker + Docker Compose v2 (depuis le dépôt officiel Docker)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# → se reconnecter en SSH pour que le groupe docker prenne effet

# Firewall : ouvrir 22 (ssh), 80 (http), 443 (https)
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # HTTP/3
sudo ufw enable
```

---

## 2. Déploiement

### 2.1. Récupérer le code

```sh
# En tant qu'utilisateur deploy
cd /srv
sudo mkdir prs && sudo chown deploy:deploy prs
cd prs
git clone <url-du-repo> .      # ou : scp / rsync l'archive
```

### 2.2. Configurer l'environnement

```sh
cp .env.example .env
nano .env
```

Renseigner **au minimum** les variables suivantes :

```ini
DATABASE_URL=file:/data/app.db
SESSION_SECRET=<généré avec `openssl rand -hex 32`>
PUBLIC_URL=https://prs.mondomaine.fr

DOMAIN=prs.mondomaine.fr
ACME_EMAIL=admin@mondomaine.fr
```

> Générer un `SESSION_SECRET` solide :
> ```sh
> openssl rand -hex 32
> ```
> **Ne jamais** réutiliser le secret d'exemple — il invalidera toutes les
> sessions existantes et protège les cookies contre la falsification.

### 2.3. Lancer la stack

```sh
docker compose build
docker compose up -d
```

La première fois, Caddy va demander un certificat à Let's Encrypt — ça prend
10–60 secondes. Suivre les logs :

```sh
docker compose logs -f caddy
docker compose logs -f app
docker compose logs -f litestream
```

### 2.4. Créer le premier formateur

Le conteneur applicatif embarque la CLI `create-user.mjs` :

```sh
docker compose exec app node scripts/create-user.mjs \
    --email=jean@exemple.fr \
    --password='MotDePasseSolide!' \
    --name='Jean Dupont'
```

Se connecter ensuite sur `https://prs.mondomaine.fr/login`.

---

## 3. Opération

### 3.1. Mises à jour de l'application

```sh
cd /srv/prs
git pull
docker compose build app
docker compose up -d app      # rolling restart du seul conteneur app
```

Les migrations Drizzle sont appliquées automatiquement au démarrage (entrypoint).

### 3.2. Logs

```sh
docker compose logs -f              # tous les services
docker compose logs -f app          # seulement l'app
docker compose logs --tail=200 app
```

### 3.3. Sauvegardes Litestream

#### Lister les snapshots disponibles

```sh
docker compose exec litestream litestream snapshots /data/app.db
docker compose exec litestream litestream generations /data/app.db
```

#### Restaurer la DB (vers un fichier temporaire pour inspection)

```sh
# Depuis le réplica file local
docker compose exec litestream \
    litestream restore -o /tmp/restored.db file:///backups/app.db

docker compose exec litestream ls -lh /tmp/restored.db
```

#### Restaurer en production (DB corrompue / perdue)

```sh
# 1. Arrêter l'app (pour libérer le WAL)
docker compose stop app

# 2. Sauvegarder la DB actuelle, au cas où
docker compose exec litestream cp /data/app.db /data/app.db.before-restore

# 3. Restaurer depuis Litestream
docker compose exec litestream \
    litestream restore -o /data/app.db -if-replica-exists file:///backups/app.db

# 4. Relancer l'app
docker compose up -d app
```

### 3.4. Activer le réplica S3 (hors-host)

1. Créer un bucket S3-compatible (OVH Object Storage S3, Scaleway, Backblaze B2…).
2. Créer une clé d'accès dédiée avec droits read/write sur ce bucket.
3. Dans `.env`, renseigner :
   ```ini
   LITESTREAM_ACCESS_KEY_ID=<AK>
   LITESTREAM_SECRET_ACCESS_KEY=<SK>
   ```
4. Dans `litestream.yml`, décommenter le bloc `- type: s3` et adapter `endpoint`,
   `region`, `bucket` selon le fournisseur choisi.
5. `docker compose up -d litestream` — Litestream reprend la réplication et
   envoie le bootstrap initial au bucket.

---

## 4. Checklist post-déploiement

Cocher chaque ligne après vérification manuelle.

### Mise en ligne

- [ ] `https://prs.mondomaine.fr` répond en 200 ou redirige vers `/login`
- [ ] Certificat TLS valide (cadenas vert, émis par Let's Encrypt)
- [ ] `curl -I https://prs.mondomaine.fr` affiche `strict-transport-security`

### Authentification & parcours utilisateur

- [ ] La page `/login` s'affiche correctement (CSS + bouton "Se connecter")
- [ ] Login avec mauvais mot de passe → message d'erreur, pas de redirection
- [ ] Login avec bon mot de passe → redirection `/layouts`
- [ ] Dashboard `/layouts` liste les layouts de l'utilisateur
- [ ] "+ Nouveau layout" crée un layout et ouvre `/editor/[id]`
- [ ] "Importer JSON" accepte un ancien export et l'importe

### Éditeur & persistance

- [ ] Ajout d'un nœud + sauvegarde (Ctrl+S) → badge "Sauvegardé." visible
- [ ] Panneau "Historique" : le nouveau snapshot apparaît marqué **actuel**
- [ ] "Restaurer" sur un snapshot antérieur → charge l'état, crée un nouveau snapshot
- [ ] Bouton "Se déconnecter" → retour sur `/login` ; DB toujours accessible
  après reconnexion

### Persistance & backups

- [ ] `docker compose restart app` : les layouts sont toujours là après reprise
- [ ] `docker compose down && docker compose up -d` : idem, aucune perte
- [ ] `docker volume inspect prs_app-data` montre bien un volume Docker peuplé
- [ ] `docker compose exec litestream litestream snapshots /data/app.db` liste
  au moins un snapshot après ~15 min de run
- [ ] `docker compose exec litestream ls -lh /backups/app.db` montre la
  structure générée par Litestream

### Sécurité minimale

- [ ] `SESSION_SECRET` de prod ≠ valeur d'exemple
- [ ] `ufw status` : seuls 22/80/443 sont ouverts
- [ ] `.env` n'est pas committé (vérifier `git status`)
- [ ] Le port 3000 N'EST PAS exposé publiquement (seul Caddy est exposé)

---

## 5. Troubleshooting

| Symptôme | Cause probable | Résolution |
|---|---|---|
| Caddy boucle sur le challenge ACME | DNS pas propagé, ou ports 80/443 fermés | Vérifier `dig +short prs.mondomaine.fr` → IP du VPS, puis `sudo ufw status` |
| L'app répond `500` au login | DB non initialisée / migration non appliquée | `docker compose logs app` — chercher `[migrate]`, sinon lancer `docker compose exec app node scripts/migrate.mjs` |
| `SESSION_SECRET is required` au démarrage | `.env` manquant ou secret trop court | Régénérer avec `openssl rand -hex 32` et `docker compose up -d` |
| Litestream en boucle `cannot open database file` | Volume `app-data` pas partagé entre `app` et `litestream` | Vérifier dans `docker-compose.yml` que les deux services montent bien `app-data:/data` |
| Les snapshots Litestream sont vides | Pas encore de WAL à répliquer (base inchangée depuis le boot) | Modifier un layout, attendre `sync-interval` (1 s), retenter |
| Impossible de se connecter après upgrade | `SESSION_SECRET` a changé | Toutes les sessions sont invalidées : se reconnecter |
