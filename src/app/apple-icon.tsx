import { ImageResponse } from 'next/og';

/**
 * Apple Touch Icon — variante E "Signal sur rail" reproduite à 180×180 px.
 *
 * On utilise un layout flex absolu avec divs (plus stable que SVG dans Satori) :
 * - rails en bas
 * - traverses derrière les rails
 * - mât + tête de signal + halo au-dessus
 */
export const size  = { width: 180, height: 180 };
export const contentType = 'image/png';

const NAVY  = '#0a0f1e';
const CYAN  = '#22d3ee';
const SLEEP = '#475569';
const MAST  = '#64748b';
const RING  = '#16a34a';
const LAMP  = '#22c55e';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: NAVY,
          position: 'relative',
          display: 'flex',
        }}
      >
        {/* ─── Voie ferrée (en bas) ────────────────────────────────────── */}
        {/* Traverses (derrière) */}
        {[20, 50, 80, 110, 140].map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: x,
              top: 130,
              width: 6,
              height: 22,
              background: SLEEP,
              borderRadius: 2,
            }}
          />
        ))}
        {/* Rails */}
        <div style={{
          position: 'absolute', left: 14, right: 14, top: 134,
          height: 4, background: CYAN, borderRadius: 2, opacity: 0.85,
        }} />
        <div style={{
          position: 'absolute', left: 14, right: 14, top: 144,
          height: 4, background: CYAN, borderRadius: 2, opacity: 0.55,
        }} />

        {/* ─── Signal ──────────────────────────────────────────────────── */}
        {/* Pied du mât */}
        <div style={{
          position: 'absolute', left: 86, top: 132,
          width: 28, height: 6, background: SLEEP, borderRadius: 3,
        }} />
        {/* Mât */}
        <div style={{
          position: 'absolute', left: 97, top: 60,
          width: 6, height: 78, background: MAST, borderRadius: 3,
        }} />

        {/* Halo extérieur */}
        <div style={{
          position: 'absolute', left: 50, top: 6,
          width: 100, height: 100, borderRadius: 50,
          border: `7px solid ${LAMP}`, opacity: 0.18,
        }} />
        {/* Halo intérieur */}
        <div style={{
          position: 'absolute', left: 64, top: 20,
          width: 72, height: 72, borderRadius: 36,
          border: `5px solid ${LAMP}`, opacity: 0.40,
        }} />

        {/* Tête de signal */}
        <div style={{
          position: 'absolute', left: 74, top: 30,
          width: 52, height: 52, borderRadius: 26,
          background: '#0f172a', border: `4px solid ${RING}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Lampe */}
          <div style={{
            width: 32, height: 32, borderRadius: 16,
            background: LAMP,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
          }}>
            {/* Reflet */}
            <div style={{
              width: 10, height: 10, borderRadius: 5,
              background: '#bbf7d0', opacity: 0.55,
              marginTop: 6, marginLeft: 6,
            }} />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
