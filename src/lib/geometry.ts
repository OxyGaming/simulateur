import { Node } from '@/types/railway';

export interface Point {
  x: number;
  y: number;
}

/** Position of a topology node (identity passthrough — node already is a point). */
export function nodeCenter(node: Node): Point {
  return { x: node.x, y: node.y };
}

/** Anchor point for a switch sitting on a node. */
export function getSwitchAnchor(node: Node): Point {
  return { x: node.x, y: node.y };
}

/**
 * Projects point (px, py) onto segment (ax, ay)→(bx, by).
 * Returns t ∈ [min, max] (default [0, 1]).
 */
export function projectOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  min = 0, max = 1,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0.5;
  const t = ((px - ax) * dx + (py - ay) * dy) / len2;
  return Math.max(min, Math.min(max, t));
}

// ─── Quadratic bezier helpers ─────────────────────────────────────────────────

/**
 * Computes the bezier control point for a curved edge.
 * curveOffset is the signed perpendicular distance from the midpoint.
 */
export function quadraticControlPoint(p1: Point, p2: Point, curveOffset: number): Point {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  if (curveOffset === 0) return { x: mx, y: my };
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py =  dx / len;
  return { x: mx + px * curveOffset, y: my + py * curveOffset };
}

/** Point on a quadratic bezier curve at parameter t ∈ [0, 1]. */
export function quadraticBezierPoint(t: number, p1: Point, cp: Point, p2: Point): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p1.x + 2 * mt * t * cp.x + t * t * p2.x,
    y: mt * mt * p1.y + 2 * mt * t * cp.y + t * t * p2.y,
  };
}

/** Tangent vector (not normalised) on a quadratic bezier at parameter t. */
export function quadraticBezierTangent(t: number, p1: Point, cp: Point, p2: Point): Point {
  const mt = 1 - t;
  return {
    x: 2 * mt * (cp.x - p1.x) + 2 * t * (p2.x - cp.x),
    y: 2 * mt * (cp.y - p1.y) + 2 * t * (p2.y - cp.y),
  };
}

/**
 * Points le long du début d'un tronçon courbe, depuis l'une de ses extrémités.
 *
 * Sert à matérialiser une branche d'aiguille en suivant la courbure du CDV
 * associé : au lieu d'un segment droit pointant vers le nœud opposé, on
 * échantillonne la bezier du tronçon sur une longueur d'arc `len`.
 *
 * atStart=true  → on part de p1 (t croissant)
 * atStart=false → on part de p2 (t décroissant)
 * Retourne au moins 2 points (dont l'extrémité de départ).
 */
export function bezierBranchPoints(
  atStart: boolean, p1: Point, cp: Point, p2: Point, len: number, steps = 24,
): Point[] {
  const start = quadraticBezierPoint(atStart ? 0 : 1, p1, cp, p2);
  const pts: Point[] = [start];
  let prev = start;
  let acc = 0;
  for (let i = 1; i <= steps; i++) {
    const tt = i / steps;
    const t = atStart ? tt : 1 - tt;
    const p = quadraticBezierPoint(t, p1, cp, p2);
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (acc + d >= len) {
      const r = d === 0 ? 0 : (len - acc) / d;
      pts.push({ x: prev.x + (p.x - prev.x) * r, y: prev.y + (p.y - prev.y) * r });
      return pts;
    }
    acc += d;
    pts.push(p);
    prev = p;
  }
  return pts;
}

/** Finds the closest parameter t on a quadratic bezier to point p (coarse sampling). */
export function closestTOnBezier(
  p: Point, p1: Point, cp: Point, p2: Point,
  min = 0.1, max = 0.9, steps = 40,
): number {
  let bestT = (min + max) / 2;
  let bestDist2 = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = min + (max - min) * (i / steps);
    const pt = quadraticBezierPoint(t, p1, cp, p2);
    const d2 = (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2;
    if (d2 < bestDist2) { bestDist2 = d2; bestT = t; }
  }
  return bestT;
}
