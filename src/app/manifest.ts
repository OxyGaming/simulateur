import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — déclare l'application installable.
 *
 * Disponible automatiquement à /manifest.webmanifest grâce à la convention
 * de fichier d'App Router de Next.js 15.
 *
 * Notes :
 * - icons : on fournit des SVG (192/512 + maskable). SVG dans le manifest est
 *   supporté par Chrome/Edge/Samsung/Firefox depuis 2019 ; pour iOS, on utilise
 *   apple-icon.tsx (servi via une <link rel="apple-touch-icon"> auto par Next).
 * - display: standalone — l'app s'ouvre sans la chrome navigateur.
 * - theme_color/background_color — match l'identité visuelle (cyan/dark navy).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PRS Simulator',
    short_name: 'PRS Sim',
    description: 'Éditeur et simulateur de réseau ferroviaire — Poste à Relais Simplifié',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0a0f1e',
    theme_color: '#0a0f1e',
    categories: ['education', 'productivity', 'utilities'],
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
