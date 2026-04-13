'use client';
import { Signal, Node } from '@/types/railway';
import { nodeCenter, quadraticControlPoint, quadraticBezierPoint, quadraticBezierTangent } from '@/lib/geometry';

// ─── SignalNode — lineside signal placed on a track edge ──────────────────────

interface Props {
  signal: Signal;
  fromNode: Node;
  toNode: Node;
  curveOffset: number;
  isSelected: boolean;
  /** null = no approach zone configured for this signal */
  zapOccupied: boolean | null;
  eapActive: boolean;
  /** True when the train holds an Autorisation de Franchissement for this signal. */
  hasAF: boolean;
  onClick:            (e: React.MouseEvent) => void;
  onLabelMouseDown:   (e: React.MouseEvent<SVGTextElement>) => void;
  onZapEapMouseDown?: (e: React.MouseEvent<SVGGElement>) => void;
}

const MAST_LEN = 16;
const HEAD_R   = 6;
const LIGHT_R  = 4;

export function SignalNode({ signal, fromNode, toNode, curveOffset, isSelected, zapOccupied, eapActive, hasAF, onClick, onLabelMouseDown, onZapEapMouseDown }: Props) {
  const from = nodeCenter(fromNode);
  const to   = nodeCenter(toNode);
  const cp   = quadraticControlPoint(from, to, curveOffset);

  // Position along the bezier curve
  const pos = quadraticBezierPoint(signal.position, from, cp, to);
  const tan = quadraticBezierTangent(signal.position, from, cp, to);

  // Unit tangent vector
  const len = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
  const tx = tan.x / len;
  const ty = tan.y / len;

  // Perpendicular: left of the signal's travel direction
  const side = signal.direction === 'AtoB' ? 1 : -1;
  const px = -ty * side;
  const py =  tx * side;

  // Signal head position
  const hx = pos.x + px * MAST_LEN;
  const hy = pos.y + py * MAST_LEN;

  // Label anchor
  const labelX = hx + px * (HEAD_R + 8) + signal.labelOffset.x;
  const labelY = hy + py * (HEAD_R + 8) + signal.labelOffset.y;

  const isOpen     = signal.state === 'open' || signal.state === 'maintained_open';
  const lightColor = isOpen ? '#22c55e' : '#ef4444';
  const ringStroke = isSelected ? '#ffffff' : (isOpen ? '#16a34a' : '#64748b');

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle cx={hx} cy={hy} r={HEAD_R + 6} fill="transparent" />

      {isSelected && (
        <circle cx={hx} cy={hy} r={HEAD_R + 5}
          fill="none" stroke="white" strokeWidth={1.5} opacity={0.5} pointerEvents="none" />
      )}

      {/* Glow halo when open */}
      {isOpen && (
        <>
          <circle cx={hx} cy={hy} r={HEAD_R + 9}
            fill="none" stroke="#22c55e" strokeWidth={4} opacity={0.15} pointerEvents="none" />
          <circle cx={hx} cy={hy} r={HEAD_R + 5}
            fill="none" stroke="#22c55e" strokeWidth={2.5} opacity={0.35} pointerEvents="none" />
        </>
      )}

      <line
        x1={pos.x - tx * 4} y1={pos.y - ty * 4}
        x2={pos.x + tx * 4} y2={pos.y + ty * 4}
        stroke="#475569" strokeWidth={2} strokeLinecap="round" pointerEvents="none"
      />
      <line
        x1={pos.x} y1={pos.y} x2={hx} y2={hy}
        stroke="#64748b" strokeWidth={2} strokeLinecap="round" pointerEvents="none"
      />
      <circle cx={hx} cy={hy} r={HEAD_R}
        fill="#0f172a" stroke={ringStroke} strokeWidth={1.5} pointerEvents="none" />
      <circle cx={hx} cy={hy} r={LIGHT_R} fill={lightColor} pointerEvents="none" />

      {/* AF badge — Autorisation de Franchissement */}
      {hasAF && (
        <g pointerEvents="none">
          <rect
            x={hx - px * (HEAD_R + 11) - 7}
            y={hy - py * (HEAD_R + 11) - 6}
            width={14} height={12} rx={2}
            fill="#7c3aed" stroke="#a78bfa" strokeWidth={1}
          />
          <text
            x={hx - px * (HEAD_R + 11)}
            y={hy - py * (HEAD_R + 11)}
            textAnchor="middle" dominantBaseline="central"
            fill="white" fontSize={7} fontFamily="monospace" fontWeight="bold"
          >
            AF
          </text>
        </g>
      )}

      <text
        x={labelX} y={labelY}
        textAnchor="middle" dominantBaseline="central"
        fill="#64748b" fontSize={9} fontFamily="monospace" fontWeight="bold"
        style={{ userSelect: 'none', cursor: 'grab' }}
        onMouseDown={onLabelMouseDown}
      >
        {signal.label}
      </text>

      {/* ── ZAp / EAp indicators — only shown when an approach zone is configured ── */}
      {zapOccupied !== null && (() => {
        const IND_R    = 3.5;
        const IND_GAP  = 9;
        const IND_SIDE = 6;

        // Base anchor: mast foot offset tangentially
        const bx = pos.x + tx * IND_SIDE;
        const by = pos.y + ty * IND_SIDE;

        // Default position (without user offset)
        const zap0x = bx + px * (MAST_LEN * 0.35);
        const zap0y = by + py * (MAST_LEN * 0.35);
        const eap0x = bx + px * (MAST_LEN * 0.35 + IND_GAP);
        const eap0y = by + py * (MAST_LEN * 0.35 + IND_GAP);

        // Apply user drag offset
        const ox = signal.zapEapOffset?.x ?? 0;
        const oy = signal.zapEapOffset?.y ?? 0;
        const zap1x = zap0x + ox; const zap1y = zap0y + oy;
        const eap1x = eap0x + ox; const eap1y = eap0y + oy;

        const zapColor  = zapOccupied ? '#f59e0b' : '#1e293b';
        const zapBorder = zapOccupied ? '#b45309' : '#334155';
        const eapColor  = eapActive   ? '#f97316' : '#1e293b';
        const eapBorder = eapActive   ? '#c2410c' : '#334155';

        return (
          <g
            style={{ cursor: onZapEapMouseDown ? 'grab' : 'default' }}
            onMouseDown={onZapEapMouseDown}
          >
            {/* Transparent hit area for drag */}
            <rect
              x={Math.min(zap1x, eap1x) - IND_R - 2}
              y={Math.min(zap1y, eap1y) - IND_R - 2}
              width={50} height={IND_GAP + IND_R * 2 + 4}
              fill="transparent"
            />
            {/* ZAp dot */}
            <circle cx={zap1x} cy={zap1y} r={IND_R}
              fill={zapColor} stroke={zapBorder} strokeWidth={1} pointerEvents="none" />
            <text x={zap1x + IND_R + 2} y={zap1y}
              dominantBaseline="central" pointerEvents="none"
              fill={zapOccupied ? '#fbbf24' : '#475569'}
              fontSize={6} fontFamily="monospace" fontWeight="bold">
              ZAp
            </text>
            {/* EAp dot */}
            <circle cx={eap1x} cy={eap1y} r={IND_R}
              fill={eapColor} stroke={eapBorder} strokeWidth={1} pointerEvents="none" />
            <text x={eap1x + IND_R + 2} y={eap1y}
              dominantBaseline="central" pointerEvents="none"
              fill={eapActive ? '#fb923c' : '#475569'}
              fontSize={6} fontFamily="monospace" fontWeight="bold">
              EAp
            </text>
          </g>
        );
      })()}
    </g>
  );
}
