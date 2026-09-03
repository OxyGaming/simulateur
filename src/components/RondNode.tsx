'use client';
import { Rond } from '@/types/railway';

// ─── Pure render component ────────────────────────────────────────────────────

interface Props {
  rond: Rond;
  isSelected: boolean;
  cursor: React.CSSProperties['cursor'];
  onMouseDown: (e: React.MouseEvent<SVGGElement>) => void;
  onClick:     (e: React.MouseEvent<SVGGElement>) => void;
}

/**
 * Repère circulaire (origine / destination d'itinéraire) tel qu'il apparaît sur
 * un plan de voie PRS. Cercle étiqueté, purement visuel.
 */
export function RondNode({ rond, isSelected, cursor, onMouseDown, onClick }: Props) {
  // Texte dimensionné pour rester dans le cercle (approx. : ~1.2 char par rayon).
  const fontSize = Math.max(8, Math.min(rond.r * 1.1, rond.r * 2 / Math.max(1, rond.text.length * 0.62)));

  return (
    <g onMouseDown={onMouseDown} onClick={onClick} style={{ cursor }}>
      {/* Halo de sélection */}
      {isSelected && (
        <circle
          cx={rond.x}
          cy={rond.y}
          r={rond.r + 3}
          fill="rgba(74,144,217,0.10)"
          stroke="#4a90d9"
          strokeWidth={1}
          strokeDasharray="4,3"
          pointerEvents="none"
        />
      )}

      {/* Rond */}
      <circle
        cx={rond.x}
        cy={rond.y}
        r={rond.r}
        fill="#0f172a"
        stroke="white"
        strokeWidth={1.5}
      />

      {/* Étiquette centrée */}
      <text
        x={rond.x}
        y={rond.y}
        fill="white"
        fontSize={fontSize}
        fontFamily="monospace"
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {rond.text}
      </text>
    </g>
  );
}
