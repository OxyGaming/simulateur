'use client';
import { Train, Node, Edge } from '@/types/railway';
import { nodeCenter, quadraticControlPoint, quadraticBezierPoint, quadraticBezierTangent } from '@/lib/geometry';

interface Props {
  train: Train;
  edge: Edge;
  fromNode: Node;
  toNode: Node;
}

const STATE_COLOR: Record<string, string> = {
  running:         '#22d3ee',  // cyan
  waiting_signal:  '#f59e0b',  // amber
  blocked:         '#ef4444',  // red
  terminated:      '#475569',  // slate
};

export function TrainMarker({ train, edge, fromNode, toNode }: Props) {
  const from = nodeCenter(fromNode);
  const to   = nodeCenter(toNode);
  const cp   = quadraticControlPoint(from, to, edge.curveOffset ?? 0);

  const pos = quadraticBezierPoint(train.t, from, cp, to);
  const tan = quadraticBezierTangent(train.t, from, cp, to);

  const len = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
  let tx = tan.x / len;
  let ty = tan.y / len;

  // For BtoA, reverse tangent so arrow points in movement direction
  if (train.direction === 'BtoA') { tx = -tx; ty = -ty; }

  const angle = Math.atan2(ty, tx) * (180 / Math.PI);
  const color = STATE_COLOR[train.state] ?? '#94a3b8';

  return (
    <g transform={`translate(${pos.x},${pos.y}) rotate(${angle})`} pointerEvents="none">
      {/* Glow halo */}
      <ellipse cx={0} cy={0} rx={16} ry={9} fill={color} opacity={0.12} />

      {/* Arrow-shaped body: flat back, pointed front */}
      <polygon
        points="-11,-5 8,-5 13,0 8,5 -11,5"
        fill="#0f172a" stroke={color} strokeWidth={1.5} strokeLinejoin="round"
      />

      {/* Train number */}
      <text
        x={-2} y={0}
        textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={7} fontFamily="monospace" fontWeight="bold"
      >
        {train.number}
      </text>
    </g>
  );
}
