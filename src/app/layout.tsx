import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { InstallPrompt } from '@/components/InstallPrompt';

export const metadata: Metadata = {
  title: 'PRS Simulator',
  description: 'Éditeur de réseau ferroviaire — Poste à Relais Simplifié',
  applicationName: 'PRS Simulator',
  // Manifest généré par src/app/manifest.ts → /manifest.webmanifest (auto par Next).
  manifest: '/manifest.webmanifest',
  // Icônes : favicon (icon.tsx) et apple-touch-icon (apple-icon.tsx) sont
  // injectés automatiquement par App Router. On précise juste les meta iOS.
  appleWebApp: {
    capable: true,
    title: 'PRS Sim',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0a0f1e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
