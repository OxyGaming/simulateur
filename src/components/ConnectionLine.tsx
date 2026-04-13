'use client';
import { useState } from 'react';
import { Edge, Node } from '@/types/railway';
import { nodeCenter, quadraticControlPoint, quadraticBezierPoint, closestTOnBezier } from '@/lib/geometry';

// ─── EdgeLine — renders a track segment between two nodes ─────────────────────

interface Props {
  edge: Edge;
  fromNode: Node;
  toNode: Node;
  isSelected: boolean;
  /** Zone colour to render as a faint identification band behind the track line. null = no zone. */
  zoneColor: string | null;
  /** Route/train state colour (yellow = active route, red = train present). null = no state. */
  stateColor: string | null;
  cursor: React.CSSProperties['cursor'];
  onClick: (e: React.MouseEvent, clickPosition: number) => void;
  onCurveHandleMouseDown: (e: React.MouseEvent) => void;
}

const TRACK_DEFAULT  = '#e2e8f0';
const TRACK_HOVER    = '#93c5fd';
const TRACK_SELECTED = '#4ade80';

export function EdgeLine({ edge, fromNode, toNode, isSelected, zoneColor, stateColor, cursor, onClick, onCurveHandleMouseDown }: Props) {
  const [hovered, setHovered] = useState(false);

  const p1 = nodeCenter(fromNode);
  const p2 = nodeCenter(toNode);
  const offset = edge.curveOffset ?? 0;
  const cp = quadraticControlPoint(p1, p2, offset);

  const pathD = `M ${p1.x} ${p1.y} Q ${cp.x} ${cp.y} ${p2.x} ${p2.y}`;

  const handleClick = (e: React.MouseEvent<SVGPathElement>) => {
    const svgEl = (e.target as SVGElement).closest('svg')!;
    const rect = svgEl.getBoundingClientRect();
    const t = closestTOnBezier(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      p1, cp, p2, 0.1, 0.9,
    );
    onClick(e, t);
  };

  const stroke      = isSelected ? TRACK_SELECTED : hovered ? TRACK_HOVER : TRACK_DEFAULT;
  const strokeWidth = isSelected ? 5 : hovered ? 4 : 3.5;

  const curveMid = quadraticBezierPoint(0.5, p1, cp, p2);

  return (
    <g>
      {/* Zone identification band (faint, always shown when edge belongs to a zone) */}
      {zoneColor && !stateColor && (
        <path
          d={pathD}
          stroke={zoneColor}
          strokeWidth={10}
          fill="none"
          opacity={isSelected ? 0 : 0.22}
          pointerEvents="none"
          strokeLinecap="round"
        />
      )}

      {/* Route / train state overlay (yellow = active route, red = train) */}
      {stateColor && !isSelected && (
        <path
          d={pathD}
          stroke={stateColor}
          strokeWidth={10}
          fill="none"
          opacity={0.75}
          pointerEvents="none"
          strokeLinecap="round"
        />
      )}

      {/* Wide transparent hit area */}
      <path
        d={pathD}
        stroke="transparent"
        strokeWidth={20}
        fill="none"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor }}
      />

      {/* Visual track line */}
      <path
        d={pathD}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        pointerEvents="none"
      />

      {/* Curve drag handle — shown when selected */}
      {isSelected && (
        <g>
          <line
            x1={curveMid.x} y1={curveMid.y}
            x2={cp.x}       y2={cp.y}
            stroke="#4a90d9" strokeWidth={1} strokeDasharray="3,3"
            opacity={0.5} pointerEvents="none"
          />
          <circle
            cx={cp.x} cy={cp.y} r={6}
            fill="#1e3a5f" stroke="#4a90d9" strokeWidth={1.5}
            style={{ cursor: 'grab' }}
            onMouseDown={onCurveHandleMouseDown}
          />
        </g>
      )}
    </g>
  );
}
