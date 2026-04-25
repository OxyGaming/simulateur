import { ImageResponse } from 'next/og';

/**
 * Favicon — version simplifiée de l'icône principale (variante E).
 * À 32×32 px, on ne garde que la lampe verte et un trait de rail cyan.
 *
 * Implémenté via ImageResponse + flex divs (Satori a un support SVG limité
 * sur les éléments fines comme stroke-linecap : on évite).
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
          background: '#0a0f1e',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        {/* Lampe verte (avec bordure assombrie pour le ring) */}
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: '#22c55e',
            border: '2px solid #16a34a',
          }}
        />
        {/* Rail cyan stylisé */}
        <div
          style={{
            width: 22,
            height: 2,
            background: '#22d3ee',
            borderRadius: 1,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
