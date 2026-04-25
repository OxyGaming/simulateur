import { ImageResponse } from 'next/og';

/**
 * Apple Touch Icon — utilisé par iOS pour l'écran d'accueil.
 * 180×180 PNG (taille standard iOS), généré au build via ImageResponse.
 * Next.js injecte automatiquement <link rel="apple-touch-icon"> dans <head>.
 */
export const size  = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0f1e',
          color: '#22d3ee',
          fontFamily: 'monospace',
          fontWeight: 700,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 14px',
              background: '#1e293b',
              border: '3px solid #334155',
              borderRadius: 12,
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 9, background: '#ef4444' }} />
            <div style={{ width: 18, height: 18, borderRadius: 9, background: '#f59e0b' }} />
            <div style={{ width: 18, height: 18, borderRadius: 9, background: '#22c55e' }} />
          </div>
          <div style={{ fontSize: 22, letterSpacing: 4, marginTop: 4 }}>PRS</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
