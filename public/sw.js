/* eslint-disable no-restricted-globals */
/**
 * Service Worker — PRS Simulator
 *
 * Stratégies par type de requête :
 * ───────────────────────────────────────────────────────────────────────────
 *  • /_next/static/*          → cache-first (immutable, hash-versionné)
 *  • Images (icons, png/svg)  → cache-first, expirées par taille de cache
 *  • Pages HTML (navigation)  → network-first, fallback cache, puis /offline
 *  • /api/*                   → network-only (jamais en cache, données fraîches)
 *  • Tout le reste GET        → stale-while-revalidate
 *  • Méthodes ≠ GET           → bypass complet du SW
 *
 * Versionnement : on bump CACHE_VERSION pour invalider tous les caches après
 * une mise à jour applicative significative. Les vieilles versions sont
 * supprimées dans `activate`.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `prs-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `prs-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE   = `prs-images-${CACHE_VERSION}`;
const HTML_CACHE    = `prs-html-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline';

// Précachage minimal : le shell offline. Les autres assets sont peuplés
// au fil des navigations (runtime caching).
const PRECACHE_URLS = [OFFLINE_URL, '/icons/icon.svg', '/manifest.webmanifest'];

const MAX_IMAGES = 60;
const MAX_RUNTIME = 80;

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Best-effort : si une URL échoue (offline page pas encore buildée en
      // dev), on continue quand même.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] precache miss:', url, err)),
        ),
      );
      // Active le nouveau SW immédiatement sans attendre la fermeture des
      // onglets ouverts.
      await self.skipWaiting();
    })(),
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const valid = new Set([STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE, HTML_CACHE]);
      await Promise.all(
        keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k)),
      );
      // Prend le contrôle des onglets déjà ouverts.
      await self.clients.claim();
    })(),
  );
});

// ─── Helpers ────────────────────────────────────────────────────────────────
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length <= maxItems) return;
  // FIFO : on supprime les plus anciens.
  for (const key of keys.slice(0, keys.length - maxItems)) {
    await cache.delete(key);
  }
}

async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.status === 200 && res.type === 'basic') {
    cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const offline = await caches.match(fallbackUrl);
      if (offline) return offline;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

// ─── Fetch handler ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Bypass : on ne touche qu'aux GET same-origin.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pas de cache pour les routes API : les données doivent être fraîches et
  // les sessions iron-session ne doivent jamais être servies depuis un cache.
  if (url.pathname.startsWith('/api/')) return;

  // Assets immutables Next.js (hash-versionnés) : cache-first agressif.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Images statiques.
  if (
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpe?g|gif|svg|webp|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      cacheFirst(req, IMAGE_CACHE).then((res) => {
        trimCache(IMAGE_CACHE, MAX_IMAGES);
        return res;
      }),
    );
    return;
  }

  // Navigations (pages HTML) : network-first → cache → /offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(req, HTML_CACHE, OFFLINE_URL));
    return;
  }

  // Reste : stale-while-revalidate (CSS/JS hors _next, fonts, manifest, etc.)
  event.respondWith(
    staleWhileRevalidate(req, RUNTIME_CACHE).then((res) => {
      trimCache(RUNTIME_CACHE, MAX_RUNTIME);
      return res;
    }),
  );
});

// ─── Message channel ───────────────────────────────────────────────────────
// Permet à l'app de demander un skipWaiting (utile pour les updates).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
