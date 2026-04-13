'use client';
import { Switch, Node } from '@/types/railway';
import { getSwitchAnchor, Point } from '@/lib/geometry';

const BRANCH_LEN   = 30;
const CENTER_R     = 6;
const HIT_R        = 16;

const COLOR_ACTIVE       = '#22c55e'; // vert — branche en position
const COLOR_DISCORDANCE  = '#f97316'; // orange — discordance détectée sur cette branche
const COLOR_INACTIVE     = '#334155';
const COLOR_ENTRY        = '#94a3b8';
const COLOR_SELECTED     = '#4ade80';
const COLOR_LOCKED       = '#f59e0b';

function branchEnd(anchor: Point, target: Node): Point {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const d  = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: anchor.x + (dx / d) * BRANCH_LEN, y: anchor.y + (dy / d) * BRANCH_LEN };
}

/** Contrôle la visibilité des branches en vue apprenant.
 *  - 'full'        : affichage normal (vue formateur)
 *  - 'hidden'      : branches masquées (apprenant sans test)
 *  - 'active-only' : seule la branche active confirmée est visible (apprenant + test)
 */
export type SwitchBranchVisibility = 'full' | 'hidden' | 'active-only';

interface SwitchNodeProps {
  sw: Switch;
  node: Node;
  entryNode:     Node | null;
  straightNode:  Node | null;
  divergingNode: Node | null;
  isSelected: boolean;
  diAlarmActive: boolean;
  branchVisibility?: SwitchBranchVisibility;
  onClick:          (e: React.MouseEvent) => void;
  onLabelMouseDown: (e: React.MouseEvent<SVGTextElement>) => void;
}

export function SwitchNode({
  sw, node, entryNode, straightNode, divergingNode,
  isSelected, diAlarmActive, branchVisibility = 'full', onClick, onLabelMouseDown,
}: SwitchNodeProps) {
  const anchor = getSwitchAnchor(node);

  const entryTip     = entryNode     ? branchEnd(anchor, entryNode)     : null;
  const straightTip  = straightNode  ? branchEnd(anchor, straightNode)  : null;
  const divergingTip = divergingNode ? branchEnd(anchor, divergingNode) : null;

  // Visibilité des branches selon le mode
  function isBranchVisible(branch: 'straight' | 'diverging'): boolean {
    if (branchVisibility === 'hidden') return false;
    if (branchVisibility === 'active-only') {
      // Seule la branche active ET confirmée (non discordante) est visible
      if (sw.position !== branch) return false;
      const isDiscordant = branch === 'straight' ? sw.discordanceStraight : sw.discordanceDiverging;
      return !isDiscordant;
    }
    return true; // 'full'
  }

  function branchColor(branch: 'straight' | 'diverging') {
    const isDiscordant = branch === 'straight' ? sw.discordanceStraight : sw.discordanceDiverging;
    if (isDiscordant && diAlarmActive) return COLOR_DISCORDANCE;
    if (sw.position === branch) return COLOR_ACTIVE;
    return COLOR_INACTIVE;
  }
  function branchWidth(branch: 'straight' | 'diverging') {
    return sw.position === branch ? 4 : 2;
  }

  const labelX = anchor.x + sw.labelOffset.x;
  const labelY = anchor.y + CENTER_R + 14 + sw.labelOffset.y;

  return (
    <g>
      {isSelected && (
        <circle cx={anchor.x} cy={anchor.y} r={CENTER_R + 10}
          fill="none" stroke={COLOR_SELECTED} strokeWidth={1.5} opacity={0.7} pointerEvents="none" />
      )}

      {entryTip && (
        <line x1={anchor.x} y1={anchor.y} x2={entryTip.x} y2={entryTip.y}
          stroke={COLOR_ENTRY} strokeWidth={3} strokeLinecap="round" pointerEvents="none" />
      )}
      {straightTip && isBranchVisible('straight') && (
        <line x1={anchor.x} y1={anchor.y} x2={straightTip.x} y2={straightTip.y}
          stroke={branchColor('straight')} strokeWidth={branchWidth('straight')}
          strokeLinecap="round" pointerEvents="none" />
      )}
      {divergingTip && isBranchVisible('diverging') && (
        <line x1={anchor.x} y1={anchor.y} x2={divergingTip.x} y2={divergingTip.y}
          stroke={branchColor('diverging')} strokeWidth={branchWidth('diverging')}
          strokeLinecap="round" pointerEvents="none" />
      )}

      <circle cx={anchor.x} cy={anchor.y} r={CENTER_R}
        fill="#0f172a" stroke={isSelected ? COLOR_SELECTED : '#4a90d9'}
        strokeWidth={isSelected ? 2.5 : 1.5} pointerEvents="none" />

      {sw.locked && (
        <g transform={`translate(${anchor.x + 10}, ${anchor.y - 18})`} pointerEvents="none">
          <path d="M 2 6 L 2 3 Q 2 0 5 0 Q 8 0 8 3 L 8 6"
            fill="none" stroke={COLOR_LOCKED} strokeWidth={1.5} strokeLinecap="round" />
          <rect x="0" y="6" width="10" height="7" rx="1.5" fill={COLOR_LOCKED} />
          <circle cx="5" cy="9.5" r="1.5" fill="#0f172a" />
          <rect x="4" y="9.5" width="2" height="3" fill="#0f172a" />
        </g>
      )}

      <text
        x={labelX} y={labelY}
        textAnchor="middle"
        fill="#94a3b8" fontSize={9} fontFamily="monospace"
        style={{ userSelect: 'none', cursor: 'grab' }}
        onMouseDown={onLabelMouseDown}
      >
        {sw.name}
      </text>

      <circle
        cx={anchor.x} cy={anchor.y} r={HIT_R}
        fill="transparent" style={{ cursor: 'pointer' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClick}
      />
    </g>
  );
}
