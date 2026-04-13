'use client';
import { Node } from '@/types/railway';

// ─── NodePoint — renders a topology junction node as two vertical bars (┆┆) ────

interface Props {
  node: Node;
  isSelected: boolean;
  isPendingSource: boolean;
  cursor: React.CSSProperties['cursor'];
  onMouseDown:      (e: React.MouseEvent<SVGGElement>) => void;
  onClick:          (e: React.MouseEvent<SVGGElement>) => void;
  onLabelMouseDown: (e: React.MouseEvent<SVGTextElement>) => void;
}

// Bar geometry
const BAR_H    = 7;    // half-height of each bar
const BAR_W    = 1.8;  // stroke width of each bar
const BAR_GAP  = 4;    // gap between the two bars (centre to centre)
const HIT_R    = 16;   // invisible hit circle radius
const BG       = '#111827'; // canvas background colour — used to mask the edge line

export function NodePoint({ node, isSelected, isPendingSource, cursor, onMouseDown, onClick, onLabelMouseDown }: Props) {
  const color = isPendingSource ? '#f39c12' : isSelected ? '#4ade80' : '#64748b';
  const opacity = node.hidden ? (isSelected ? 0.3 : 0) : 1;

  const { x, y } = node;
  const lx = x + node.labelOffset.x;
  const ly = y + BAR_H + 12 + node.labelOffset.y;

  if (node.hidden && !isSelected) {
    return (
      <g onClick={onClick} style={{ cursor }}>
        <rect x={x - HIT_R} y={y - HIT_R} width={HIT_R * 2} height={HIT_R * 2} fill="transparent" onMouseDown={onMouseDown} />
      </g>
    );
  }

  return (
    <g onClick={onClick} style={{ cursor }}>
      {/* Large transparent hit target */}
      <rect x={x - HIT_R} y={y - HIT_R} width={HIT_R * 2} height={HIT_R * 2} fill="transparent" onMouseDown={onMouseDown} />

      {/* Selection / pending glow behind bars */}
      {(isSelected || isPendingSource) && (
        <rect
          x={x - BAR_GAP - BAR_W * 2} y={y - BAR_H - 3}
          width={BAR_GAP * 2 + BAR_W * 4} height={(BAR_H + 3) * 2}
          rx={2}
          fill="none" stroke={color} strokeWidth={1}
          strokeDasharray={isPendingSource ? '4,3' : undefined}
          opacity={0.55} pointerEvents="none"
        />
      )}

      {/* Background mask between bars — hides the edge line passing through */}
      <rect
        x={x - BAR_GAP / 2 + BAR_W / 2} y={y - BAR_H}
        width={BAR_GAP - BAR_W} height={BAR_H * 2}
        fill={BG} pointerEvents="none"
      />
      {/* Left bar */}
      <line
        x1={x - BAR_GAP / 2} y1={y - BAR_H}
        x2={x - BAR_GAP / 2} y2={y + BAR_H}
        stroke={color} strokeWidth={BAR_W} strokeLinecap="round"
        opacity={opacity} pointerEvents="none"
      />
      {/* Right bar */}
      <line
        x1={x + BAR_GAP / 2} y1={y - BAR_H}
        x2={x + BAR_GAP / 2} y2={y + BAR_H}
        stroke={color} strokeWidth={BAR_W} strokeLinecap="round"
        opacity={opacity} pointerEvents="none"
      />

      {/* Draggable label */}
      {!node.hidden && !node.labelHidden && (
        <text
          x={lx} y={ly}
          textAnchor="middle"
          fill={isSelected ? '#a7f3d0' : '#64748b'}
          fontSize={10}
          fontFamily="monospace"
          fontWeight={isSelected ? 'bold' : 'normal'}
          style={{ userSelect: 'none', cursor: 'grab' }}
          onMouseDown={onLabelMouseDown}
        >
          {node.label}
        </text>
      )}
    </g>
  );
}
