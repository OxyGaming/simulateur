import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PRS Simulator',
  description: 'Éditeur de réseau ferroviaire — Poste à Relais Simplifié',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
