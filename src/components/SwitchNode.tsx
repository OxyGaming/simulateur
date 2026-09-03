'use client';
import { Switch, Node } from '@/types/railway';
import { getSwitchAnchor, quadraticControlPoint, bezierBranchPoints, Point } from '@/lib/geometry';

const BRANCH_LEN   = 30;
const CENTER_R     = 6;
const HIT_R        = 16;

const COLOR_ACTIVE       = '#22c55e'; // vert — branche en position
const COLOR_DISCORDANCE  = '#f97316'; // orange — discordance détectée sur cette branche
const COLOR_INACTIVE     = '#334155';
const COLOR_ENTRY        = '#94a3b8';
const COLOR_SELECTED     = '#4ade80';
const COLOR_LOCKED       = '#f59e0b';

/**
 * Géométrie d'une branche = le tronçon (CDV) associé, décrit par ses deux
 * extrémités (centres de nœuds), sa courbure et le fait que l'aiguille soit à
 * l'extrémité de départ (p1) ou d'arrivée (p2).
 */
export interface BranchGeom {
  p1: Point;
  p2: Point;
  curveOffset: number;
  atStart: boolean;
}

/** Chemin SVG d'une branche, suivant la courbure du CDV sur BRANCH_LEN. */
function branchPathD(geom: BranchGeom): string {
  const cp = quadraticControlPoint(geom.p1, geom.p2, geom.curveOffset);
  const pts = bezierBranchPoints(geom.atStart, geom.p1, cp, geom.p2, BRANCH_LEN);
  return 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L ');
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
  entryBranch:     BranchGeom | null;
  straightBranch:  BranchGeom | null;
  divergingBranch: BranchGeom | null;
  isSelected: boolean;
  diAlarmActive: boolean;
  branchVisibility?: SwitchBranchVisibility;
  onClick:          (e: React.MouseEvent) => void;
  onLabelMouseDown: (e: React.MouseEvent<SVGTextElement>) => void;
}

export function SwitchNode({
  sw, node, entryBranch, straightBranch, divergingBranch,
  isSelected, diAlarmActive, branchVisibility = 'full', onClick, onLabelMouseDown,
}: SwitchNodeProps) {
  const anchor = getSwitchAnchor(node);

  const entryPath     = entryBranch     ? branchPathD(entryBranch)     : null;
  const straightPath  = straightBranch  ? branchPathD(straightBranch)  : null;
  const divergingPath = divergingBranch ? branchPathD(divergingBranch) : null;

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

      {entryPath && (
        <path d={entryPath} fill="none"
          stroke={COLOR_ENTRY} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      )}
      {straightPath && isBranchVisible('straight') && (
        <path d={straightPath} fill="none"
          stroke={branchColor('straight')} strokeWidth={branchWidth('straight')}
          strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      )}
      {divergingPath && isBranchVisible('diverging') && (
        <path d={divergingPath} fill="none"
          stroke={branchColor('diverging')} strokeWidth={branchWidth('diverging')}
          strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
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
