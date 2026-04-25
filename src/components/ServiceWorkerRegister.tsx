'use client';
import { useEffect } from 'react';

/**
 * Enregistre le service worker côté client.
 *
 * - Désactivé en dev (next dev) pour éviter les caches bloquants pendant les
 *   itérations. On enregistre uniquement en production.
 * - En cas d'update (nouveau SW en `waiting`), on lui envoie SKIP_WAITING
 *   pour qu'il prenne immédiatement le contrôle au prochain rechargement.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Vérifie les updates au chargement et chaque 60 min.
        reg.update().catch(() => {});
        const interval = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

        // Auto-activation des nouveaux SW.
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        return () => clearInterval(interval);
      } catch (err) {
        console.warn('[SW] registration failed:', err);
      }
    };

    if (document.readyState === 'complete') void onLoad();
    else window.addEventListener('load', onLoad, { once: true });

    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
