import { Edge, Node, Zone, Switch } from '@/types/railway';

export interface RouteResult {
  edgeIds: string[];
  switchPositions: Record<string, 'straight' | 'diverging'>;
}

/** Returns the node ID shared by two edges, or null if they don't share one. */
function sharedNode(e1: Edge, e2: Edge): string | null {
  if (e1.fromNodeId === e2.fromNodeId || e1.fromNodeId === e2.toNodeId) return e1.fromNodeId;
  if (e1.toNodeId  === e2.fromNodeId || e1.toNodeId  === e2.toNodeId)  return e1.toNodeId;
  return null;
}

/**
 * BFS on the edge graph to find the shortest sequence of edges connecting
 * fromZone to toZone.  Switch positions are deduced from the path.
 *
 * Returns null when no path exists.
 */
export function findRoute(
  fromZone: Zone,
  toZone:   Zone,
  edges:    Edge[],
  nodes:    Node[],
  switches: Switch[],
): RouteResult | null {
  if (fromZone.id === toZone.id) return null;

  // ── Build edge adjacency ────────────────────────────────────────────────────
  // edgesByNode: nodeId → edgeId[]
  const edgesByNode = new Map<string, string[]>();
  for (const n of nodes) edgesByNode.set(n.id, []);
  for (const e of edges) {
    edgesByNode.get(e.fromNodeId)?.push(e.id);
    edgesByNode.get(e.toNodeId)?.push(e.id);
  }

  // edgeAdj: edgeId → adjacent edgeId[] (edges sharing a node)
  const edgeAdj = new Map<string, string[]>();
  const edgeMap = new Map(edges.map(e => [e.id, e]));
  for (const e of edges) {
    const adj = new Set<string>();
    for (const nid of [e.fromNodeId, e.toNodeId]) {
      for (const eid of edgesByNode.get(nid) ?? []) {
        if (eid !== e.id) adj.add(eid);
      }
    }
    edgeAdj.set(e.id, [...adj]);
  }

  // ── BFS from origin zone edges ──────────────────────────────────────────────
  const fromEdgeSet = new Set(fromZone.edgeIds);
  const toEdgeSet   = new Set(toZone.edgeIds);

  // visited: edgeId → prevEdgeId | null (null = BFS start)
  const visited = new Map<string, string | null>();
  const queue: string[] = [];

  for (const eid of fromZone.edgeIds) {
    if (edgeMap.has(eid)) { visited.set(eid, null); queue.push(eid); }
  }

  let found: string | null = null;
  while (queue.length > 0 && !found) {
    const cur = queue.shift()!;
    // Reached a destination edge that isn't also an origin edge
    if (toEdgeSet.has(cur) && !fromEdgeSet.has(cur)) { found = cur; break; }
    for (const next of edgeAdj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.set(next, cur);
        queue.push(next);
      }
    }
  }

  if (!found) return null;

  // ── Reconstruct edge path ───────────────────────────────────────────────────
  const pathEdgeIds: string[] = [];
  let cur = found;
  while (true) {
    pathEdgeIds.unshift(cur);
    const prev = visited.get(cur);
    if (prev === null || prev === undefined) break;
    cur = prev;
  }

  // ── Deduce switch positions from consecutive edge pairs ─────────────────────
  const switchPositions: Record<string, 'straight' | 'diverging'> = {};
  const switchesByNode = new Map(switches.map(s => [s.nodeId, s]));

  for (let i = 0; i + 1 < pathEdgeIds.length; i++) {
    const e1 = edgeMap.get(pathEdgeIds[i]);
    const e2 = edgeMap.get(pathEdgeIds[i + 1]);
    if (!e1 || !e2) continue;

    const nodeId = sharedNode(e1, e2);
    if (!nodeId) continue;

    const sw = switchesByNode.get(nodeId);
    if (!sw) continue;

    const id1 = e1.id, id2 = e2.id;
    let pos: 'straight' | 'diverging' | null = null;

    if (id1 === sw.entryEdgeId || id2 === sw.entryEdgeId) {
      // One edge is the entry — check what the other is
      const other = id1 === sw.entryEdgeId ? id2 : id1;
      if (other === sw.straightEdgeId)  pos = 'straight';
      if (other === sw.divergingEdgeId) pos = 'diverging';
    } else {
      // Traversal from the straight/diverging side
      if (id1 === sw.straightEdgeId  || id2 === sw.straightEdgeId)  pos = 'straight';
      if (id1 === sw.divergingEdgeId || id2 === sw.divergingEdgeId) pos = 'diverging';
    }

    if (pos) switchPositions[sw.id] = pos;
  }

  return { edgeIds: pathEdgeIds, switchPositions };
}
