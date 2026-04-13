import { Node, Edge, Zone, Signal, Switch, TextLabel, Route, PanelButton, ReflexionDevice } from '@/types/railway';

// ─── Layout data (new format) ─────────────────────────────────────────────────

export interface LayoutData {
  nodes: Node[];
  edges: Edge[];
  zones: Zone[];
  signals: Signal[];
  switches: Switch[];
  textLabels?: TextLabel[];
  /** Itinéraires PRS configurés (logique métier pure, sans état runtime). */
  routes?: Record<string, Route>;
  /** Boutons du pupitre PRS (configuration + dispositifs de réflexion). États remis à idle à l'import. */
  panelButtons?: Record<string, PanelButton>;
}

export interface ValidationResult {
  data: LayoutData;
  warnings: string[];
  fatalError?: string;
}

// ─── Per-type guards (new format) ────────────────────────────────────────────

function isNode(v: unknown): v is Node {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.label === 'string' &&
    typeof o.x === 'number' &&
    typeof o.y === 'number'
  );
}

function isEdge(v: unknown): v is Edge {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.fromNodeId === 'string' && (o.fromNodeId as string).length > 0 &&
    typeof o.toNodeId === 'string' && (o.toNodeId as string).length > 0
  );
}

function isZone(v: unknown): v is Zone {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.label === 'string' &&
    Array.isArray(o.edgeIds)
  );
}

function isSignal(v: unknown): v is Signal {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.edgeId === 'string' && (o.edgeId as string).length > 0 &&
    (o.direction === 'AtoB' || o.direction === 'BtoA') &&
    typeof o.position === 'number' &&
    (o.state === 'open' || o.state === 'closed') &&
    typeof o.label === 'string'
  );
}

function isSwitch(v: unknown): v is Switch {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.name === 'string' &&
    typeof o.nodeId === 'string' && (o.nodeId as string).length > 0 &&
    (o.entryEdgeId === null || typeof o.entryEdgeId === 'string') &&
    (o.straightEdgeId === null || typeof o.straightEdgeId === 'string') &&
    (o.divergingEdgeId === null || typeof o.divergingEdgeId === 'string') &&
    (o.position === 'straight' || o.position === 'diverging') &&
    typeof o.locked === 'boolean'
  );
}

function isTextLabel(v: unknown): v is TextLabel {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.text === 'string' &&
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.fontSize === 'number' && (o.fontSize as number) >= 6
  );
}

function isReflexionDevice(v: unknown): v is ReflexionDevice {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.slot === 'number' && (o.type === 'DA' || o.type === 'DSA' || o.type === 'DR');
}

function isRoute(v: unknown): v is Route {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    Array.isArray(o.edgeIds) &&
    o.switchPositions !== null && typeof o.switchPositions === 'object' && !Array.isArray(o.switchPositions) &&
    Array.isArray(o.signalIds) &&
    Array.isArray(o.zoneConditions)
  );
}

function isPanelButton(v: unknown): v is PanelButton {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.label === 'string' &&
    (o.type === 'route' || o.type === 'fc' || o.type === 'annulateur') &&
    typeof o.col === 'number' &&
    typeof o.row === 'number'
  );
}

// ─── Old format detection & migration ────────────────────────────────────────

type OldZone = { id: string; label?: string; x?: number; y?: number; width?: number; height?: number; labelOffset?: { x: number; y: number } };
type OldConn = { id: string; fromZoneId?: string; toZoneId?: string; curveOffset?: number };
type OldSignal = { id: string; connectionId?: string; edgeId?: string; direction: string; position: number; state: string; label: string; labelOffset?: { x: number; y: number } };
type OldSwitch = { id: string; name?: string; zoneId?: string; nodeId?: string; entryConnectionId?: string | null; straightConnectionId?: string | null; divergingConnectionId?: string | null; entryEdgeId?: string | null; straightEdgeId?: string | null; divergingEdgeId?: string | null; position: string; locked: boolean; labelOffset?: { x: number; y: number } };

function isOldFormat(obj: Record<string, unknown>): boolean {
  if (Array.isArray(obj.connections)) return true;
  if (Array.isArray(obj.zones) && (obj.zones as unknown[]).length > 0) {
    const first = (obj.zones as unknown[])[0] as Record<string, unknown>;
    if (typeof first?.width === 'number') return true;
  }
  return false;
}

let _counter = 0;
function uid(): string {
  return `cdv_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

function migrateOldFormat(obj: Record<string, unknown>): Record<string, unknown> {
  const NO: { x: number; y: number } = { x: 0, y: 0 };
  const oldZones: OldZone[] = Array.isArray(obj.zones) ? (obj.zones as OldZone[]) : [];
  const oldConns: OldConn[] = Array.isArray(obj.connections) ? (obj.connections as OldConn[]) : [];
  const oldSignals: OldSignal[] = Array.isArray(obj.signals) ? (obj.signals as OldSignal[]) : [];
  const oldSwitches: OldSwitch[] = Array.isArray(obj.switches) ? (obj.switches as OldSwitch[]) : [];

  const nodes: Node[] = oldZones.map(oz => ({
    id: oz.id,
    label: oz.label ?? 'Nœud',
    x: (oz.x ?? 0) + (oz.width ?? 100) / 2,
    y: (oz.y ?? 0) + (oz.height ?? 40) / 2,
    labelOffset: oz.labelOffset ?? { ...NO },
  }));

  const edges: Edge[] = oldConns.map(oc => ({
    id: oc.id,
    fromNodeId: oc.fromZoneId ?? '',
    toNodeId:   oc.toZoneId   ?? '',
    curveOffset: oc.curveOffset ?? 0,
  }));

  // One CDV zone per edge
  const zones: Zone[] = edges.map(e => ({
    id: `cdv_${e.id}`,
    label: 'CDV',
    edgeIds: [e.id],
    labelOffset: { ...NO },
    occupiedManual: false,
    derangement: false,
    annulled:    false,
  }));

  const signals: Signal[] = oldSignals.map(os => ({
    id: os.id,
    edgeId: os.connectionId ?? os.edgeId ?? '',
    direction: os.direction as 'AtoB' | 'BtoA',
    position: os.position,
    state: os.state as 'open' | 'closed',
    label: os.label,
    labelOffset: os.labelOffset ?? { ...NO },
  }));

  const switches: Switch[] = oldSwitches.map(os => ({
    id: os.id,
    name: os.name ?? 'Aig.',
    nodeId:          os.zoneId         ?? os.nodeId          ?? '',
    entryEdgeId:     os.entryConnectionId     ?? os.entryEdgeId     ?? null,
    straightEdgeId:  os.straightConnectionId  ?? os.straightEdgeId  ?? null,
    divergingEdgeId: os.divergingConnectionId ?? os.divergingEdgeId ?? null,
    position: os.position as 'straight' | 'diverging',
    locked: os.locked,
    labelOffset: os.labelOffset ?? { ...NO },
    zonePropreId: null,
    discordanceStraight: false,
    discordanceDiverging: false,
  }));

  return {
    nodes, edges, zones, signals, switches,
    textLabels: Array.isArray(obj.textLabels) ? obj.textLabels : [],
  };
}

// ─── Main validator ────────────────────────────────────────────────────────────

const EMPTY: LayoutData = { nodes: [], edges: [], zones: [], signals: [], switches: [], textLabels: [] };

export function validateLayout(json: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { data: EMPTY, warnings: [], fatalError: 'JSON invalide : impossible de parser le fichier.' };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { data: EMPTY, warnings: [], fatalError: 'Format invalide : la racine doit être un objet JSON.' };
  }

  let obj = raw as Record<string, unknown>;
  const warnings: string[] = [];

  // Migrate old format automatically
  if (isOldFormat(obj)) {
    obj = migrateOldFormat(obj);
    warnings.push('Ancien format détecté — migration automatique vers le nouveau modèle (Node / Edge / Zone CDV).');
  }

  // Extract arrays
  if (!Array.isArray(obj.nodes))   warnings.push('"nodes" absent ou invalide → aucun nœud chargé.');
  if (!Array.isArray(obj.edges))   warnings.push('"edges" absent ou invalide → aucun tronçon chargé.');
  if (!Array.isArray(obj.zones))   warnings.push('"zones" absent ou invalide → aucune zone CDV chargée.');
  if (!Array.isArray(obj.signals)) warnings.push('"signals" absent ou invalide → aucun signal chargé.');
  if (!Array.isArray(obj.switches)) warnings.push('"switches" absent ou invalide → aucune aiguille chargée.');

  const rawNodes    = Array.isArray(obj.nodes)    ? (obj.nodes    as unknown[]) : [];
  const rawEdges    = Array.isArray(obj.edges)    ? (obj.edges    as unknown[]) : [];
  const rawZones    = Array.isArray(obj.zones)    ? (obj.zones    as unknown[]) : [];
  const rawSignals  = Array.isArray(obj.signals)  ? (obj.signals  as unknown[]) : [];
  const rawSwitches = Array.isArray(obj.switches) ? (obj.switches as unknown[]) : [];

  const nodes   = rawNodes.filter(isNode);
  const edges   = rawEdges.filter(isEdge);
  const zones   = rawZones.filter(isZone);
  const signals = rawSignals.filter(isSignal);
  const switches = rawSwitches.filter(isSwitch);

  // Duplicate ID check
  const allIds = [...nodes.map(n => n.id), ...edges.map(e => e.id), ...zones.map(z => z.id), ...signals.map(s => s.id), ...switches.map(sw => sw.id)];
  const seen = new Set<string>();
  let dupCount = 0;
  for (const id of allIds) { if (seen.has(id)) dupCount++; seen.add(id); }
  if (dupCount > 0) warnings.push(`${dupCount} ID(s) dupliqué(s) détecté(s).`);

  // Cross-references
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeIds = new Set(edges.map(e => e.id));

  const validEdges = edges.filter(e =>
    e.fromNodeId !== e.toNodeId &&
    nodeIds.has(e.fromNodeId) &&
    nodeIds.has(e.toNodeId)
  );
  const validEdgeIds = new Set(validEdges.map(e => e.id));

  const validSignals = signals.filter(s => validEdgeIds.has(s.edgeId));

  // Zones: filter edgeIds entries that don't exist
  const validZones = zones.map(z => {
    const filtered = z.edgeIds.filter(eid => validEdgeIds.has(eid));
    return { ...z, edgeIds: filtered };
  }).filter(z => z.edgeIds.length > 0);

  // Switches: nodeId must exist, edge refs nullified if missing
  const switchesWithNode = switches.filter(sw => nodeIds.has(sw.nodeId));
  const seenNodeIds = new Set<string>();
  let dupSw = 0;
  const switchesDeduped = switchesWithNode.filter(sw => {
    if (seenNodeIds.has(sw.nodeId)) { dupSw++; return false; }
    seenNodeIds.add(sw.nodeId); return true;
  });
  if (dupSw > 0) warnings.push(`${dupSw} aiguille(s) en double sur un même nœud — doublon(s) ignoré(s).`);

  let nullifiedRefs = 0;
  const validSwitches = switchesDeduped.map(sw => {
    const fix = (ref: string | null) => {
      if (ref === null) return null;
      if (!validEdgeIds.has(ref)) { nullifiedRefs++; return null; }
      return ref;
    };
    return { ...sw, entryEdgeId: fix(sw.entryEdgeId), straightEdgeId: fix(sw.straightEdgeId), divergingEdgeId: fix(sw.divergingEdgeId) };
  });
  if (nullifiedRefs > 0) warnings.push(`${nullifiedRefs} référence(s) de tronçon sur aiguille(s) introuvable(s) — réinitialisée(s).`);

  const skipped =
    (rawNodes.length - nodes.length) +
    (rawEdges.length - validEdges.length) +
    (rawSignals.length - validSignals.length) +
    (rawSwitches.length - switches.length);
  if (skipped > 0) warnings.push(`${skipped} objet(s) ignoré(s) : données incomplètes ou références orphelines.`);

  const rawTextLabels = Array.isArray(obj.textLabels) ? (obj.textLabels as unknown[]) : [];
  const textLabels = rawTextLabels.filter(isTextLabel);

  // ── Routes ────────────────────────────────────────────────────────────────
  let routes: Record<string, Route> | undefined;
  if (obj.routes !== undefined) {
    if (typeof obj.routes !== 'object' || Array.isArray(obj.routes)) {
      warnings.push('"routes" invalide — ignoré.');
    } else {
      const rawRoutes = obj.routes as Record<string, unknown>;
      const validRoutes: Record<string, Route> = {};
      let skippedRoutes = 0;
      for (const [k, v] of Object.entries(rawRoutes)) {
        if (isRoute(v)) {
          validRoutes[k] = v;
        } else {
          skippedRoutes++;
        }
      }
      if (skippedRoutes > 0) warnings.push(`${skippedRoutes} itinéraire(s) ignoré(s) : données invalides.`);
      routes = validRoutes;
    }
  }

  // ── PanelButtons ──────────────────────────────────────────────────────────
  let panelButtons: Record<string, PanelButton> | undefined;
  if (obj.panelButtons !== undefined) {
    if (typeof obj.panelButtons !== 'object' || Array.isArray(obj.panelButtons)) {
      warnings.push('"panelButtons" invalide — ignoré.');
    } else {
      const rawButtons = obj.panelButtons as Record<string, unknown>;
      const validButtons: Record<string, PanelButton> = {};
      let skippedButtons = 0;
      for (const [k, v] of Object.entries(rawButtons)) {
        if (isPanelButton(v)) {
          // Normalise: reset runtime state to idle, ensure reflexions field exists
          const btn = v as PanelButton;
          validButtons[k] = {
            ...btn,
            state: 'idle',
            reflexions: Array.isArray(btn.reflexions)
              ? (btn.reflexions as unknown[]).filter(isReflexionDevice)
              : [],
            annulateurZoneIds: Array.isArray(btn.annulateurZoneIds) ? btn.annulateurZoneIds : [],
            routeId:    btn.routeId   ?? null,
            fcSignalId: btn.fcSignalId ?? null,
          };
        } else {
          skippedButtons++;
        }
      }
      if (skippedButtons > 0) warnings.push(`${skippedButtons} bouton(s) pupitre ignoré(s) : données invalides.`);
      panelButtons = validButtons;
    }
  }

  return {
    data: { nodes, edges: validEdges, zones: validZones, signals: validSignals, switches: validSwitches, textLabels, routes, panelButtons },
    warnings,
  };
}
