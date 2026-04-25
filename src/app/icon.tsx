import { ImageResponse } from 'next/og';

/**
 * Favicon dynamique — Next.js sert ce route comme /icon (et l'injecte
 * automatiquement dans <head>). 32×32 PNG généré au build, suffisant pour
 * la barre d'onglet et les bookmarks desktop.
 */
export const size  = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0f1e',
          color: '#22d3ee',
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          borderRadius: 6,
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
