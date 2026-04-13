'use client';
import { Zone, Edge, Node } from '@/types/railway';
import { nodeCenter, quadraticControlPoint, quadraticBezierPoint } from '@/lib/geometry';

// ─── Zone colour palette ──────────────────────────────────────────────────────

export const ZONE_PALETTE = [
  '#3b82f6', '#22c55e', '#f97316', '#a855f7',
  '#ec4899', '#14b8a6', '#f59e0b', '#ef4444',
];

export function zoneColor(index: number): string {
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
}

// ─── ZoneBadge — label overlay for a CDV zone ────────────────────────────────

interface Props {
  zone: Zone;
  edges: Edge[];
  nodes: Node[];
  color: string;
  isSelected: boolean;
  isEditMode: boolean;   // true when in editZone mode
  blockPointer?: boolean; // true when another zone is being edited — pass clicks through
  onClick: (e: React.MouseEvent) => void;
  onLabelMouseDown: (e: React.MouseEvent<SVGRectElement>) => void;
}

export function ZoneBadge({ zone, edges, nodes, color, isSelected, isEditMode, blockPointer, onClick, onLabelMouseDown }: Props) {
  // Compute badge position: average midpoint of all zone's edges
  let sumX = 0, sumY = 0, count = 0;
  for (const edgeId of zone.edgeIds) {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) continue;
    const fromNode = nodes.find(n => n.id === edge.fromNodeId);
    const toNode   = nodes.find(n => n.id === edge.toNodeId);
    if (!fromNode || !toNode) continue;
    const p1 = nodeCenter(fromNode);
    const p2 = nodeCenter(toNode);
    const cp = quadraticControlPoint(p1, p2, edge.curveOffset ?? 0);
    const mid = quadraticBezierPoint(0.5, p1, cp, p2);
    sumX += mid.x;
    sumY += mid.y;
    count++;
  }

  if (count === 0) return null;

  const cx = sumX / count + zone.labelOffset.x;
  const cy = sumY / count + zone.labelOffset.y;
  const w  = Math.max(48, zone.label.length * 7 + 16);

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }} pointerEvents={blockPointer ? 'none' : undefined}>
      {/* Badge background */}
      <rect
        x={cx - w / 2} y={cy - 9}
        width={w} height={18}
        rx={4}
        fill={isSelected || isEditMode ? color : `${color}33`}
        stroke={color}
        strokeWidth={isSelected ? 1.5 : 1}
        opacity={isSelected ? 1 : 0.85}
      />
      {/* Badge label */}
      <text
        x={cx} y={cy}
        textAnchor="middle" dominantBaseline="central"
        fill={isSelected || isEditMode ? 'white' : color}
        fontSize={10} fontFamily="monospace" fontWeight="bold"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {zone.label}
      </text>
      {/* Drag handle — transparent rect covering the badge for label repositioning */}
      <rect
        x={cx - w / 2} y={cy - 9}
        width={w} height={18}
        fill="transparent"
        style={{ cursor: 'grab' }}
        onMouseDown={onLabelMouseDown}
      />
    </g>
  );
}
