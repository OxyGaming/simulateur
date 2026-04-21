import { create } from 'zustand';
import {
  Node, Edge, Zone, Signal, Switch, TextLabel,
  Route, RouteZoneCondition, RouteInterlockingState, ZoneRole,
  PanelButton, ButtonState, PupitreLabel,
  EditorMode, SelectedObject, SignalDirection, LabelOffset, Train,
} from '@/types/railway';
import { LayoutData } from '@/lib/validation';
import {
  InterlockingContext, CanFormResult,
  canFormItineraire, checkEAp, checkCIA,
  getZoneAnnulmentType, AnnulmentType,
} from '@/lib/interlocking';

// ─── Train simulation helpers ─────────────────────────────────────────────────

/** Nearest closed signal on same edge, same direction, at or ahead of train.t (AF signals excluded) */
function getBlockingSignal(train: Train, signals: Signal[]): Signal | null {
  const af = train.afSignalIds ?? [];
  const candidates = signals.filter(sig =>
    sig.edgeId === train.edgeId &&
    sig.direction === train.direction &&
    sig.state === 'closed' &&
    !af.includes(sig.id) &&
    (train.direction === 'AtoB' ? sig.position >= train.t - 0.02 : sig.position <= train.t + 0.02)
  );
  if (candidates.length === 0) return null;
  return train.direction === 'AtoB'
    ? candidates.sort((a, b) => a.position - b.position)[0]
    : candidates.sort((a, b) => b.position - a.position)[0];
}

/** Nearest closed signal strictly between current t and newT (AF signals excluded) */
function getBlockingSignalInPath(
  train: Train, newT: number, signals: Signal[]
): Signal | null {
  const af = train.afSignalIds ?? [];
  const edgeSigs = signals.filter(sig =>
    sig.edgeId === train.edgeId &&
    sig.direction === train.direction &&
    sig.state === 'closed' &&
    !af.includes(sig.id)
  );
  if (train.direction === 'AtoB') {
    const ahead = edgeSigs
      .filter(sig => sig.position > train.t && sig.position <= newT)
      .sort((a, b) => a.position - b.position);
    return ahead[0] ?? null;
  } else {
    const ahead = edgeSigs
      .filter(sig => sig.position < train.t && sig.position >= newT)
      .sort((a, b) => b.position - a.position);
    return ahead[0] ?? null;
  }
}

interface NextEdgeResult { nextEdge: Edge; nextDirection: SignalDirection }

function findNextEdge(
  exitNodeId: string,
  currentEdgeId: string,
  edges: Edge[],
  switches: Switch[],
): NextEdgeResult | null {
  const sw = switches.find(sw => sw.nodeId === exitNodeId);
  if (sw) {
    let nextEdgeId: string | null = null;
    if (sw.entryEdgeId === currentEdgeId) {
      nextEdgeId = sw.position === 'straight' ? sw.straightEdgeId : sw.divergingEdgeId;
    } else if (sw.straightEdgeId === currentEdgeId || sw.divergingEdgeId === currentEdgeId) {
      nextEdgeId = sw.entryEdgeId;
    }
    if (!nextEdgeId) return null;
    const nextEdge = edges.find(e => e.id === nextEdgeId);
    if (!nextEdge) return null;
    const nextDirection: SignalDirection = nextEdge.fromNodeId === exitNodeId ? 'AtoB' : 'BtoA';
    return { nextEdge, nextDirection };
  }

  // No switch: require exactly one adjacent edge
  const adjacent = edges.filter(e =>
    e.id !== currentEdgeId &&
    (e.fromNodeId === exitNodeId || e.toNodeId === exitNodeId)
  );
  if (adjacent.length !== 1) return null;
  const nextEdge = adjacent[0];
  const nextDirection: SignalDirection = nextEdge.fromNodeId === exitNodeId ? 'AtoB' : 'BtoA';
  return { nextEdge, nextDirection };
}

// ─── Interlocking helpers ─────────────────────────────────────────────────────

/** Build the InterlockingContext from a store snapshot. */
function buildCtx(s: RailwayStore): InterlockingContext {
  return {
    occupiedEffective: s.occupiedEffective,
    getZonesByRole:    s.getZonesByRole,
  };
}

/**
 * Collect all edge IDs currently used by active route buttons,
 * excluding the button under evaluation.
 */
function buildActiveEdgeIds(
  s: RailwayStore,
  excludeButtonId: string,
): ReadonlySet<string> {
  return new Set(
    Object.values(s.panelButtons)
      .filter(b => b.state === 'active' && b.id !== excludeButtonId && b.routeId)
      .flatMap(b => s.routes[b.routeId!]?.edgeIds ?? [])
  );
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

/** Return a shallow copy of `obj` without the given key. */
function omitKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  const { [key]: _removed, ...rest } = obj;
  return rest as T;
}

/** Build a fresh RouteInterlockingState for the 'forming', 'registered' or 'overregistered' phase. */
function initialInterlockingState(
  routeId: string,
  state: 'forming' | 'registered' | 'overregistered' = 'forming',
): RouteInterlockingState {
  return {
    routeId,
    buttonState:      state,
    formingStartTime: Date.now(),
    EPA_active:       false,
    EAP_active:       false,
    transitCleared:   [],
    DM_startTime:     null,
    DM_confirmed:     false,
  };
}

/**
 * Classify a failed canFormItineraire result as a permanent conflict or a
 * temporary wait (registered / overregistered).
 *
 * PRS rules:
 *   registered    — first slot in the wait queue: one incompatible itinerary anticipated at a time.
 *                   Any route (DA or TP) can occupy this slot if it is free.
 *   overregistered — subsequent slots: only TP (Tracé Permanent) routes may join the queue
 *                   when the first slot is already taken. DA routes are refused (conflict).
 *   conflict      — permanent block (manual switch lock) OR DA route requesting when slot is taken.
 *
 * Temporary block = all blocking conditions come from currently active routes
 * (edge conflict is always from active routes; switch conflict is temporary only when
 * ALL conflicting switches are locked by active routes, not by manual operator action).
 */
function classifyFormationBlock(
  result:          CanFormResult,
  panelButtons:    Record<string, PanelButton>,
  routes:          Record<string, Route>,
  excludeButtonId: string,
  newRouteType:    'DA' | 'TP',
): 'conflict' | 'registered' | 'overregistered' {
  const { switchConflict, edgeConflict } = result.blocking;

  // ── 1. Check if the block is temporary (all causes from active routes) ─────

  // Switch IDs held by currently active routes via E.Pa
  const activeRouteSwitchIds = new Set(
    Object.values(panelButtons)
      .filter(b => b.state === 'active' && b.id !== excludeButtonId && b.routeId)
      .flatMap(b => Object.keys(routes[b.routeId!]?.switchPositions ?? {})),
  );

  // A switch conflict is temporary only when EVERY conflicting switch belongs to an active route.
  // If any switch is manually locked (not by an active route), the conflict is permanent.
  const switchBlockIsTemporary =
    !switchConflict.ok &&
    switchConflict.conflictingSwitchIds.every(swId => activeRouteSwitchIds.has(swId));

  const isTemporaryBlock =
    // At least one blocking condition exists (sanity — we're called when canForm=false)
    (edgeConflict || !switchConflict.ok) &&
    // Every switch conflict (if any) is from an active route
    (switchConflict.ok || switchBlockIsTemporary);

  if (!isTemporaryBlock) return 'conflict'; // permanent block — refuse immediately

  // ── 2. Queue position rules ───────────────────────────────────────────────

  // Count how many buttons are currently in the 'registered' (first) slot.
  // 'overregistered' are TP routes already queued beyond the first slot — don't count them here.
  const existingRegistered = Object.values(panelButtons).filter(
    b => b.state === 'registered' && b.id !== excludeButtonId,
  ).length;

  if (existingRegistered === 0) {
    // First slot is free — any route (DA or TP) can register
    return 'registered';
  }

  // First slot is taken:
  //   TP routes may join as overregistered (surenregistrement — file d'attente TP)
  //   DA routes are refused (one incompatible itinerary anticipated at a time)
  return newRouteType === 'TP' ? 'overregistered' : 'conflict';
}

/**
 * Try to advance all 'registered' / 'overregistered' buttons in FIFO order.
 *
 * Two possible transitions per waiting route, evaluated in order:
 *   1. registered | overregistered → forming     (conditions now satisfied)
 *   2. overregistered              → registered  (first slot freed, still blocked)
 *
 * The FIFO ordering is preserved across both transitions: the oldest waiter
 * is considered first, which prevents a newer overregistered from jumping
 * ahead of an older one into the first slot.
 *
 * Reference-stable: returns null when nothing changes.
 * Pure function — usable inside set() callbacks.
 */
function tryActivateRegistered(
  panelButtons: Record<string, PanelButton>,
  routes:       Record<string, Route>,
  zones:        Zone[],
  switches:     Switch[],
  trains:       Train[],
  ris:          Record<string, RouteInterlockingState>,
): {
  panelButtons:             Record<string, PanelButton>;
  routeInterlockingStates:  Record<string, RouteInterlockingState>;
} | null {
  const waiting = Object.values(panelButtons)
    .filter(b => (b.state === 'registered' || b.state === 'overregistered') && b.routeId)
    .sort((a, b) => {
      const ta = ris[a.routeId ?? '']?.formingStartTime ?? 0;
      const tb = ris[b.routeId ?? '']?.formingStartTime ?? 0;
      return ta - tb; // FIFO
    });

  if (waiting.length === 0) return null;

  // Inline occupiedEffective (same logic as store method)
  const annulatedIds = getAnnulatedZoneIds(panelButtons);
  const occupiedEffective = (zoneId: string): boolean => {
    if (annulatedIds.has(zoneId)) return false;
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return false;
    if (zone.derangement && zone.annulled) return false;
    if (zone.derangement || zone.occupiedManual) return true;
    return trains.some(t => t.state !== 'terminated' && zone.edgeIds.includes(t.edgeId));
  };

  const getZonesByRole = (routeId: string, role: ZoneRole): string[] => {
    const conds = routes[routeId]?.zoneConditions ?? [];
    const matching = conds.filter(c => c.roles.includes(role));
    if (role === 'transit') {
      matching.sort((a, b) => (a.transitIndex ?? 0) - (b.transitIndex ?? 0));
    }
    return matching.map(c => c.zoneId);
  };

  const ctx: InterlockingContext = { occupiedEffective, getZonesByRole };

  let updatedButtons = panelButtons;
  let updatedRis     = ris;
  let changed        = false;

  for (const btn of waiting) {
    const route = routes[btn.routeId!];
    if (!route) continue;

    // Build active edge IDs from the in-progress updatedButtons. Include both
    // 'active' AND 'forming': a route promoted to forming earlier in this loop
    // iteration has reserved its edges — another waiting route must not also
    // promote onto the same edges, or both would enter forming simultaneously
    // and the second would fail canFormItineraire at activateButton time
    // (→ 'conflict') once the first reaches 'active'.
    const activeEdgeIds = new Set(
      Object.values(updatedButtons)
        .filter(b => (b.state === 'active' || b.state === 'forming') && b.id !== btn.id && b.routeId)
        .flatMap(b => routes[b.routeId!]?.edgeIds ?? []),
    );

    const result = canFormItineraire(
      route, switches, activeEdgeIds, ctx,
      { skipCIA: true, skipZPZEA: true },
    );

    if (result.canForm) {
      const routeId = route.id;
      updatedButtons = {
        ...updatedButtons,
        [btn.id]: { ...btn, state: 'forming' as ButtonState },
      };
      updatedRis = {
        ...updatedRis,
        [routeId]: {
          ...(updatedRis[routeId] ?? initialInterlockingState(routeId, 'forming')),
          buttonState:      'forming' as ButtonState,
          formingStartTime: Date.now(),
        },
      };
      changed = true;
      continue;
    }

    // Can't form yet. If this route is overregistered and the first slot is free,
    // promote it to registered. The first slot is free when no other waiting
    // route holds 'registered' state (forming/active routes are past the queue).
    if (btn.state === 'overregistered') {
      const hasRegisteredAhead = Object.values(updatedButtons).some(
        b => b.state === 'registered' && b.id !== btn.id,
      );
      if (!hasRegisteredAhead) {
        const routeId = route.id;
        updatedButtons = {
          ...updatedButtons,
          [btn.id]: { ...btn, state: 'registered' as ButtonState },
        };
        // Preserve formingStartTime to keep FIFO ordering stable.
        const prev = updatedRis[routeId] ?? initialInterlockingState(routeId, 'registered');
        updatedRis = {
          ...updatedRis,
          [routeId]: { ...prev, buttonState: 'registered' as ButtonState },
        };
        changed = true;
      }
    }
  }

  if (!changed) return null;
  return { panelButtons: updatedButtons, routeInterlockingStates: updatedRis };
}

/**
 * Determine which transit zones were cleared when the train moved from
 * prevEdgeId to nextEdgeId, and which routes have reached DA (all transit
 * zones cleared).
 *
 * Clearing rule:
 *   A transit zone Z (at index i) is cleared when the train was in Z and
 *   has now moved to a zone at a higher index (or left the route's transit
 *   sequence entirely). Hysteresis is preserved via `ris.transitCleared`.
 *
 * Returns:
 *   newStates  — updated RouteInterlockingState records (reference-stable
 *                when nothing changed)
 *   daRouteIds — routeIds whose transit sequence is now fully cleared (DA)
 */
function computeTransitClearing(
  states:      Record<string, RouteInterlockingState>,
  routes:      Record<string, Route>,
  zones:       Zone[],
  prevEdgeId:  string,
  nextEdgeId:  string,
): { newStates: Record<string, RouteInterlockingState>; daRouteIds: string[] } {
  const prevZone = zones.find(z => z.edgeIds.includes(prevEdgeId));
  const nextZone = zones.find(z => z.edgeIds.includes(nextEdgeId));

  const newStates: Record<string, RouteInterlockingState> = { ...states };
  const daRouteIds: string[] = [];
  let changed = false;

  for (const [routeId, ris] of Object.entries(states)) {
    if (ris.buttonState !== 'active') continue;

    const route = routes[routeId];
    if (!route) continue;

    const transitConds = route.zoneConditions
      .filter(c => c.roles.includes('transit'))
      .sort((a, b) => (a.transitIndex ?? 0) - (b.transitIndex ?? 0));
    if (transitConds.length === 0) continue; // no transit defined → no DA

    const transitIds = transitConds.map(c => c.zoneId);

    if (!prevZone || !transitIds.includes(prevZone.id)) continue;
    if (ris.transitCleared.includes(prevZone.id)) continue; // already cleared

    const prevIdx = transitIds.indexOf(prevZone.id);
    const nextIdx = nextZone ? transitIds.indexOf(nextZone.id) : -1;

    // Forward movement: next zone is later OR train left the transit sequence
    const movedForward = nextIdx === -1 || nextIdx > prevIdx;
    if (!movedForward) continue;

    const newCleared = [...ris.transitCleared, prevZone.id];
    const allCleared = transitIds.every(id => newCleared.includes(id));

    newStates[routeId] = { ...ris, transitCleared: newCleared };
    changed = true;

    if (allCleared) daRouteIds.push(routeId);
  }

  return { newStates: changed ? newStates : states, daRouteIds };
}

/**
 * Returns the set of zone IDs currently annulled by active annulateur buttons.
 * Pure helper — usable inside set() callbacks.
 */
function getAnnulatedZoneIds(panelButtons: Record<string, PanelButton>): Set<string> {
  const ids = new Set<string>();
  for (const btn of Object.values(panelButtons)) {
    if (btn.type === 'annulateur' && btn.state === 'active') {
      for (const zId of btn.annulateurZoneIds) ids.add(zId);
    }
  }
  return ids;
}

/**
 * Recompute EAP_active for every active route, using the provided zones and
 * train snapshot (called inside set() — cannot use get() or store methods).
 */
function recomputeEApStates(
  states:       Record<string, RouteInterlockingState>,
  routes:       Record<string, Route>,
  zones:        Zone[],
  trains:       Train[],
  panelButtons: Record<string, PanelButton> = {},
): Record<string, RouteInterlockingState> {
  const annulatedIds = getAnnulatedZoneIds(panelButtons);

  // Inline occupiedEffective — mirrors the store method but uses local snapshots
  const occupiedEffective = (zoneId: string): boolean => {
    if (annulatedIds.has(zoneId)) return false; // annulateur actif sur cette zone
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return false;
    if (zone.derangement && zone.annulled) return false; // EE neutralized
    if (zone.derangement || zone.occupiedManual) return true;
    return trains.some(t => t.state !== 'terminated' && zone.edgeIds.includes(t.edgeId));
  };

  const getZonesByRole = (routeId: string, role: ZoneRole): string[] => {
    const conds = routes[routeId]?.zoneConditions ?? [];
    const matching = conds.filter(c => c.roles.includes(role));
    if (role === 'transit') {
      matching.sort((a, b) => (a.transitIndex ?? 0) - (b.transitIndex ?? 0));
    }
    return matching.map(c => c.zoneId);
  };

  const ctx: InterlockingContext = { occupiedEffective, getZonesByRole };

  let changed = false;
  const updated: Record<string, RouteInterlockingState> = {};

  for (const [routeId, state] of Object.entries(states)) {
    if (state.buttonState !== 'active') {
      updated[routeId] = state;
      continue;
    }
    const eap = checkEAp(routeId, ctx);
    if (state.EAP_active !== eap.active) {
      updated[routeId] = { ...state, EAP_active: eap.active };
      changed = true;
    } else {
      updated[routeId] = state;
    }
  }

  return changed ? updated : states; // reference-stable when nothing changed
}

/**
 * When EAP_active transitions, carry the signal state along:
 *   false → true  : 'open' → 'maintained_open'
 *   true  → false : 'maintained_open' → 'open'
 *
 * Only touches signals belonging to routes whose EAP_active changed.
 * Reference-stable when no transition occurred.
 */
function applyEApToSignals(
  oldStates: Record<string, RouteInterlockingState>,
  newStates: Record<string, RouteInterlockingState>,
  routes:    Record<string, Route>,
  signals:   Signal[],
): Signal[] {
  // Collect only the routes that actually changed EAP_active
  const transitions: Array<{ routeId: string; toActive: boolean }> = [];
  for (const routeId of Object.keys(newStates)) {
    const oldEap = oldStates[routeId]?.EAP_active ?? false;
    const newEap = newStates[routeId]?.EAP_active ?? false;
    if (oldEap !== newEap) transitions.push({ routeId, toActive: newEap });
  }
  if (transitions.length === 0) return signals;

  return signals.map(sig => {
    for (const { routeId, toActive } of transitions) {
      if (!routes[routeId]?.signalIds.includes(sig.id)) continue;
      if (toActive && sig.state === 'open')             return { ...sig, state: 'maintained_open' as const };
      if (!toActive && sig.state === 'maintained_open') return { ...sig, state: 'open'            as const };
    }
    return sig;
  });
}

/**
 * Progressive switch release during transit.
 *
 * A switch `sw` can be released from E.Pa early (before full DA) when:
 *   1. The switch has a zone propre (`sw.zonePropreId`).
 *   2. Every active route that uses this switch (`route.switchPositions[sw.id]`)
 *      satisfies one of:
 *      - The zone propre IS a transit zone in that route AND is in `transitCleared`.
 *   3. No active route that uses this switch has the zone propre as a non-transit
 *      zone (in which case we can't determine clearing — keep locked).
 *
 * Reference-stable: returns the same array if nothing changed.
 */
function computeProgressiveSwitchUnlocks(
  newStates: Record<string, RouteInterlockingState>,
  routes:    Record<string, Route>,
  switches:  Switch[],
): Switch[] {
  let result = switches;
  for (let i = 0; i < switches.length; i++) {
    const sw = switches[i];
    if (!sw.locked || !sw.zonePropreId) continue;
    const zonePropreId = sw.zonePropreId;

    // All active routes that have this switch in their switch positions
    const relevantRis = Object.values(newStates).filter(
      ris => ris.buttonState === 'active' &&
             routes[ris.routeId]?.switchPositions[sw.id] !== undefined,
    );
    if (relevantRis.length === 0) continue;

    const canUnlock = relevantRis.every(ris => {
      const route = routes[ris.routeId];
      if (!route) return true;
      const isTransit = route.zoneConditions.some(
        c => c.zoneId === zonePropreId && c.roles.includes('transit'),
      );
      if (!isTransit) return false; // zone propre not in transit sequence — keep locked
      return ris.transitCleared.includes(zonePropreId);
    });

    if (!canUnlock) continue;

    // Unlock: copy-on-write
    if (result === switches) result = [...switches];
    result[i] = { ...sw, locked: false };
  }
  return result;
}

/**
 * For every active route whose signals are currently 'closed' but whose ZP/ZEA
 * zones are now all free, open the signals.
 *
 * Called after any zone-occupation change (train movement, toggleZoneOccupied,
 * derangement, annulment) so that ZP/ZEA clearance automatically opens the signal.
 *
 * Reference-stable: returns same array when no signal state changes.
 */
function recomputeSignalOpenings(
  states:       Record<string, RouteInterlockingState>,
  routes:       Record<string, Route>,
  zones:        Zone[],
  signals:      Signal[],
  trains:       Train[],
  panelButtons: Record<string, PanelButton>,
  switches:     Switch[] = [],
): Signal[] {
  // Inline occupiedEffective (same logic as in store method)
  const annulatedIds = getAnnulatedZoneIds(panelButtons);
  const occupiedEffective = (zoneId: string): boolean => {
    if (annulatedIds.has(zoneId)) return false; // annulateur actif
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return false;
    if (zone.derangement && zone.annulled) return false;
    if (zone.derangement || zone.occupiedManual) return true;
    return trains.some(t => t.state !== 'terminated' && zone.edgeIds.includes(t.edgeId));
  };

  // FC-blocked signal IDs
  const fcBlockedIds = new Set(
    Object.values(panelButtons)
      .filter(b => b.type === 'fc' && b.state === 'active' && b.fcSignalId)
      .map(b => b.fcSignalId!),
  );

  let result = signals;

  for (const [routeId, ris] of Object.entries(states)) {
    if (ris.buttonState !== 'active' || !ris.EPA_active) continue;
    const route = routes[routeId];
    if (!route) continue;

    // Check CIA (permanent — discordance causes failure)
    if (switches.length > 0 && !checkCIA(route, switches).ok) continue;

    // Check ZP and ZEA
    const zpOk  = route.zoneConditions.filter(c => c.roles.includes('ZP'))
                    .every(c => !occupiedEffective(c.zoneId));
    const zeaOk = route.zoneConditions.filter(c => c.roles.includes('ZEA'))
                    .every(c => !occupiedEffective(c.zoneId));
    if (!zpOk || !zeaOk) continue; // zone still blocking — don't open

    const openState = ris.EAP_active ? 'maintained_open' as const : 'open' as const;

    // Open any signal of this route that is currently 'closed' and not FC-blocked
    const routeSigIds = new Set(route.signalIds);
    let changed = false;
    const next = result.map(sig => {
      if (!routeSigIds.has(sig.id))  return sig;
      if (fcBlockedIds.has(sig.id)) return sig;
      if (sig.state !== 'closed')   return sig; // already open or maintained_open
      changed = true;
      return { ...sig, state: openState };
    });
    if (changed) result = next;
  }

  return result; // reference-stable when nothing changed
}

// ─── Discordance alarm ────────────────────────────────────────────────────────

function playDiscordanceAlarm(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtxClass = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx: AudioContext = new AudioCtxClass();
    const sr  = ctx.sampleRate;
    const dur = 0.8; // seconds
    const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t     = i / sr;
      const phase = Math.floor(t / 0.1) % 2;
      const freq  = phase === 0 ? 880 : 1100;
      const fade  = Math.max(0, 1 - t / dur);
      data[i] = Math.sin(2 * Math.PI * freq * t) * 0.35 * fade;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    src.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
  } catch { /* Web Audio not available */ }
}

let _counter = 0;
function uid(): string {
  return `${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

const NO_OFFSET: LabelOffset = { x: 0, y: 0 };

/** DMT mandatory delay between first and second gesture (3 min in real PRS). */
export const DMT_DELAY_MS = 1 * 60 * 1000;

// ─── Undo snapshot ────────────────────────────────────────────────────────────

interface UndoSnapshot {
  nodes: Node[];
  edges: Edge[];
  zones: Zone[];
  signals: Signal[];
  switches: Switch[];
  textLabels: TextLabel[];
  routes: Record<string, Route>;
  panelButtons: Record<string, PanelButton>;
  pupitreLabels: PupitreLabel[];
}

// ─── State shape ──────────────────────────────────────────────────────────────

interface PendingEdge {
  fromNodeId: string;
}

interface RailwayStore {
  // ── Domain ──────────────────────────────────────────────────────────────────
  nodes: Node[];
  edges: Edge[];
  zones: Zone[];
  signals: Signal[];
  switches: Switch[];
  textLabels: TextLabel[];
  pupitreLabels: PupitreLabel[];
  routes: Record<string, Route>;
  panelButtons: Record<string, PanelButton>;
  /**
   * Runtime interlocking state per route (keyed by routeId).
   * Populated when a route starts forming; reset to initial values when it
   * returns to 'idle'. Never duplicates route definition data.
   */
  routeInterlockingStates: Record<string, RouteInterlockingState>;
  /**
   * Last canFormItineraire result for each button in 'conflict' state.
   * Keyed by buttonId. Cleared when the button leaves conflict.
   * Used by the UI to display a human-readable reason for the refusal.
   */
  conflictDetails: Record<string, CanFormResult>;
  /** Phase de clignotement (toggle toutes les 500 ms quand un bouton est en forming) */
  blinkPhase: boolean;
  /**
   * Alarme DI active — true uniquement quand une discordance a été détectée lors
   * de l'activation d'un itinéraire (activateButton). Reste active jusqu'à ce que
   * toutes les discordances soient levées.
   * N'est PAS activée par setSwitchDiscordance (le formateur pose le flag matériel
   * sans que le système le sache avant qu'un itinéraire tente d'utiliser la branche).
   */
  diAlarmActive: boolean;
  /** Position du témoin DI (Discordance d'Aiguille) sur le TCO — librement repositionnable. */
  diIndicatorPos: { x: number; y: number };

  // ── Train simulation ──────────────────────────────────────────────────────
  trains: Train[];

  // ── Undo ─────────────────────────────────────────────────────────────────────
  undoStack: UndoSnapshot[];
  undo: () => void;

  // ── UI ──────────────────────────────────────────────────────────────────────
  mode: EditorMode;
  selection: SelectedObject;
  pendingEdge: PendingEdge | null;

  // ── Node actions ─────────────────────────────────────────────────────────────
  addNode: (x: number, y: number) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  deleteNode: (id: string) => void;

  // ── Edge actions ─────────────────────────────────────────────────────────────
  addEdge: (fromNodeId: string, toNodeId: string) => void;
  updateEdge: (id: string, patch: Partial<Edge>) => void;
  deleteEdge: (id: string) => void;

  // ── Zone (CDV) actions ───────────────────────────────────────────────────────
  addZone: (edgeId: string) => void;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  deleteZone: (id: string) => void;
  assignEdgeToZone: (zoneId: string, edgeId: string) => void;
  removeEdgeFromZone: (zoneId: string, edgeId: string) => void;

  // ── Signal actions ───────────────────────────────────────────────────────────
  addSignal: (edgeId: string, direction: SignalDirection, position: number) => void;
  updateSignal: (id: string, patch: Partial<Signal>) => void;
  deleteSignal: (id: string) => void;

  // ── Switch actions ───────────────────────────────────────────────────────────
  addSwitch: (nodeId: string) => void;
  updateSwitch: (id: string, patch: Partial<Switch>) => void;
  deleteSwitch: (id: string) => void;
  toggleSwitchPosition: (id: string) => void;
  toggleSwitchLock: (id: string) => void;
  /**
   * Set or clear discordance on a specific branch of a switch.
   *
   * branch='straight'  : perte de contrôle de la branche directe.
   * branch='diverging' : perte de contrôle de la branche déviée.
   *
   * When active=true : CIA fails for routes using that branch → their signals close.
   * When active=false: CIA may clear → signals reopen if ZP/ZEA also clear.
   * Plays an alarm sound when activating a discordance.
   */
  setSwitchDiscordance: (id: string, branch: 'straight' | 'diverging', active: boolean) => void;
  /**
   * Auto-assign entryEdgeId / straightEdgeId / divergingEdgeId from geometry.
   * Requires exactly 3 edges connected to the switch node.
   * Entry = the edge most "opposite" to the two forward branches.
   * Straight = the forward branch most aligned with the continuation of the entry.
   * Diverging = the remaining forward branch.
   */
  autoAssignSwitch: (switchId: string) => void;

  // ── TextLabel actions ────────────────────────────────────────────────────────
  addTextLabel: (x: number, y: number) => void;
  updateTextLabel: (id: string, patch: Partial<TextLabel>) => void;
  deleteTextLabel: (id: string) => void;

  // ── PupitreLabel actions (plaques vue apprenante) ─────────────────────────────
  addPupitreLabel: (x: number, y: number) => void;
  updatePupitreLabel: (id: string, patch: Partial<PupitreLabel>) => void;
  deletePupitreLabel: (id: string) => void;

  // ── UI actions ───────────────────────────────────────────────────────────────
  setMode: (mode: EditorMode) => void;
  setSelection: (obj: SelectedObject) => void;
  setPendingEdge: (p: PendingEdge | null) => void;
  testZoneActive: boolean;
  setTestZoneActive: (v: boolean) => void;
  testAiguilleActive: boolean;
  setTestAiguilleActive: (v: boolean) => void;

  // ── Route actions (logique métier pure) ─────────────────────────────────────
  addRoute:    (route: Omit<Route, 'id'>) => string;
  updateRoute: (id: string, patch: Partial<Route>) => void;
  removeRoute: (id: string) => void;
  /**
   * Assign or clear the approach zone (role 'approche') for a route.
   * zoneId=null removes any existing approach zone condition.
   * If the zone already has other roles on this route they are preserved;
   * only the 'approche' role is added/removed.
   */
  setRouteApproachZone: (routeId: string, zoneId: string | null) => void;

  // ── PanelButton actions ──────────────────────────────────────────────────────
  addPanelButton:    (type?: 'route' | 'fc' | 'annulateur') => string;
  updatePanelButton: (id: string, patch: Partial<PanelButton>) => void;
  removePanelButton: (id: string) => void;
  /** Clic utilisateur — démarre la formation ou libère l'itinéraire */
  pressButton:          (buttonId: string) => void;
  /** Appelé ~700ms après formation : positionne les aiguilles et ouvre les signaux */
  activateButton:       (buttonId: string) => void;
  toggleBlinkPhase:     () => void;
  /** Repositionne le témoin DI sur le TCO. */
  setDiIndicatorPos:    (pos: { x: number; y: number }) => void;
  /** Bascule zone.occupiedManual (simule train absent du modèle, ou dérangement CDV) */
  toggleZoneOccupied:   (zoneId: string) => void;
  /** Met une zone en état de dérangement CDV (distinct de l'occupation manuelle). */
  setZoneDerangement: (zoneId: string, active: boolean) => void;
  /** Annule l'effet d'enclenchement de la zone (EE neutralisé, occupation visible maintenue). */
  annulZone:          (zoneId: string) => void;
  /** Rétablit l'effet d'enclenchement de la zone (lève l'Ann. Zone). */
  cancelZoneAnnulment:(zoneId: string) => void;
  /** Retourne le type d'annulateur requis pour une zone donnée. */
  getZoneAnnulmentType: (zoneId: string) => AnnulmentType;

  // ── Interlocking primitives ──────────────────────────────────────────────────
  /**
   * Effective occupation of a zone for interlocking purposes.
   * True when zone.occupiedManual OR a simulated train is on one of the zone's edges.
   * This is the single entry point for all interlocking condition checks.
   */
  occupiedEffective: (zoneId: string) => boolean;
  /**
   * Returns the RouteZoneCondition entries for a given route.
   * Empty array if the route does not exist or has no zone conditions.
   */
  getRouteZoneConditions: (routeId: string) => RouteZoneCondition[];
  /**
   * Returns the zoneIds that carry a given role within a specific route.
   * Ordered by transitIndex when role === 'transit'.
   */
  getZonesByRole: (routeId: string, role: ZoneRole) => string[];

  // ── Train simulation ─────────────────────────────────────────────────────────
  placeTrain:        (edgeId: string, t: number) => void;
  removeTrain:       (trainId: string) => void;
  startSimulation:   (trainId: string) => void;
  stopSimulation:    (trainId: string) => void;
  setTrainNumber:    (trainId: string, number: string) => void;
  setTrainDirection: (trainId: string, direction: SignalDirection) => void;
  setTrainSpeed:     (trainId: string, speed: number) => void;
  /** Accorder une Autorisation de Franchissement au train pour un signal fermé. */
  grantAF:           (trainId: string, signalId: string) => void;
  /** Révoquer une Autorisation de Franchissement. */
  revokeAF:          (trainId: string, signalId: string) => void;
  tickSimulation:    (dt: number) => void;

  // ── Persistence ──────────────────────────────────────────────────────────────
  exportLayout: () => string;
  loadLayout: (data: LayoutData) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRailwayStore = create<RailwayStore>((set, get) => {
  /** Push layout snapshot onto undo stack (max 50 entries). */
  const saveUndo = () => {
    const s = get();
    const snapshot: UndoSnapshot = {
      nodes: s.nodes, edges: s.edges, zones: s.zones,
      signals: s.signals, switches: s.switches, textLabels: s.textLabels,
      routes: s.routes, panelButtons: s.panelButtons, pupitreLabels: s.pupitreLabels,
    };
    set(prev => ({ undoStack: [...prev.undoStack.slice(-49), snapshot] }));
  };

  return {
  nodes: [],
  edges: [],
  zones: [],
  signals: [],
  switches: [],
  textLabels: [],
  pupitreLabels: [],
  routes: {},
  panelButtons: {},
  routeInterlockingStates: {},
  conflictDetails: {},
  blinkPhase: false,
  diAlarmActive: false,
  diIndicatorPos: { x: 60, y: 60 },
  trains: [],
  undoStack: [],
  mode: 'select',
  selection: null,
  pendingEdge: null,
  testZoneActive: false,
  testAiguilleActive: false,

  // ── Nodes ──────────────────────────────────────────────────────────────────

  addNode: (x, y) => {
    saveUndo();
    const node: Node = { id: uid(), label: 'Nœud', x, y, labelOffset: { ...NO_OFFSET } };
    set(s => ({ nodes: [...s.nodes, node], selection: { type: 'node', id: node.id } }));
  },

  updateNode: (id, patch) => {
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }));
  },

  deleteNode: (id) => {
    saveUndo();
    set(s => {
      const goneEdgeIds = new Set(
        s.edges.filter(e => e.fromNodeId === id || e.toNodeId === id).map(e => e.id)
      );
      const remainingEdges = s.edges.filter(e => !goneEdgeIds.has(e.id));
      const zones = s.zones
        .map(z => ({ ...z, edgeIds: z.edgeIds.filter(eid => !goneEdgeIds.has(eid)) }))
        .filter(z => z.edgeIds.length > 0);
      return {
        nodes:    s.nodes.filter(n => n.id !== id),
        edges:    remainingEdges,
        zones,
        signals:  s.signals.filter(sig => !goneEdgeIds.has(sig.edgeId)),
        switches: s.switches.filter(sw => sw.nodeId !== id),
        selection: null,
      };
    });
  },

  // ── Edges ──────────────────────────────────────────────────────────────────

  addEdge: (fromNodeId, toNodeId) => {
    saveUndo();
    if (fromNodeId === toNodeId) return;
    const already = get().edges.some(
      e => (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
           (e.fromNodeId === toNodeId   && e.toNodeId === fromNodeId)
    );
    if (already) return;

    const edge: Edge = { id: uid(), fromNodeId, toNodeId, curveOffset: 0 };
    // Auto-create one CDV zone per edge
    const zone: Zone = { id: uid(), label: 'CDV', edgeIds: [edge.id], labelOffset: { ...NO_OFFSET }, occupiedManual: false, derangement: false, annulled: false };

    set(s => ({
      edges:      [...s.edges, edge],
      zones:      [...s.zones, zone],
      selection:  { type: 'edge', id: edge.id },
      pendingEdge: null,
    }));
  },

  updateEdge: (id, patch) => {
    set(s => ({ edges: s.edges.map(e => e.id === id ? { ...e, ...patch } : e) }));
  },

  deleteEdge: (id) => {
    saveUndo();
    set(s => {
      const zones = s.zones
        .map(z => ({ ...z, edgeIds: z.edgeIds.filter(eid => eid !== id) }))
        .filter(z => z.edgeIds.length > 0);
      return {
        edges:    s.edges.filter(e => e.id !== id),
        zones,
        signals:  s.signals.filter(sig => sig.edgeId !== id),
        switches: s.switches.map(sw => ({
          ...sw,
          entryEdgeId:     sw.entryEdgeId     === id ? null : sw.entryEdgeId,
          straightEdgeId:  sw.straightEdgeId  === id ? null : sw.straightEdgeId,
          divergingEdgeId: sw.divergingEdgeId === id ? null : sw.divergingEdgeId,
        })),
        selection: null,
      };
    });
  },

  // ── Zones (CDV) ────────────────────────────────────────────────────────────

  addZone: (edgeId) => {
    saveUndo();
    const zone: Zone = { id: uid(), label: 'CDV', edgeIds: [edgeId], labelOffset: { ...NO_OFFSET }, occupiedManual: false, derangement: false, annulled: false };
    // Remove the edge from any existing zone first
    set(s => ({
      zones: [
        ...s.zones.map(z => ({ ...z, edgeIds: z.edgeIds.filter(eid => eid !== edgeId) })).filter(z => z.edgeIds.length > 0),
        zone,
      ],
      selection: { type: 'zone', id: zone.id },
    }));
  },

  updateZone: (id, patch) => {
    set(s => ({ zones: s.zones.map(z => z.id === id ? { ...z, ...patch } : z) }));
  },

  deleteZone: (id) => {
    saveUndo();
    set(s => ({ zones: s.zones.filter(z => z.id !== id), selection: null }));
  },

  assignEdgeToZone: (zoneId, edgeId) => {
    saveUndo();
    set(s => ({
      // Remove edgeId from any other zone, then add to target zone
      zones: s.zones.map(z => {
        if (z.id === zoneId) {
          return z.edgeIds.includes(edgeId) ? z : { ...z, edgeIds: [...z.edgeIds, edgeId] };
        }
        return { ...z, edgeIds: z.edgeIds.filter(eid => eid !== edgeId) };
      }).filter(z => z.edgeIds.length > 0),
    }));
  },

  removeEdgeFromZone: (zoneId, edgeId) => {
    saveUndo();
    set(s => ({
      zones: s.zones
        .map(z => z.id === zoneId ? { ...z, edgeIds: z.edgeIds.filter(eid => eid !== edgeId) } : z)
        .filter(z => z.edgeIds.length > 0),
    }));
  },

  // ── Signals ────────────────────────────────────────────────────────────────

  addSignal: (edgeId, direction, position) => {
    saveUndo();
    const sig: Signal = {
      id: uid(), edgeId, direction,
      position: Math.max(0.1, Math.min(0.9, position)),
      state: 'closed', label: 'S',
      labelOffset: { ...NO_OFFSET },
    };
    set(s => ({ signals: [...s.signals, sig], selection: { type: 'signal', id: sig.id } }));
  },

  updateSignal: (id, patch) => {
    set(s => ({ signals: s.signals.map(sig => sig.id === id ? { ...sig, ...patch } : sig) }));
  },

  deleteSignal: (id) => {
    saveUndo();
    set(s => ({ signals: s.signals.filter(sig => sig.id !== id), selection: null }));
  },

  // ── Switches ───────────────────────────────────────────────────────────────

  addSwitch: (nodeId) => {
    saveUndo();
    const state = get();
    if (!state.nodes.find(n => n.id === nodeId)) return;
    const existing = state.switches.find(sw => sw.nodeId === nodeId);
    if (existing) {
      set({ selection: { type: 'switch', id: existing.id } });
      return;
    }
    const sw: Switch = {
      id: uid(), name: 'Aig.', nodeId,
      entryEdgeId: null, straightEdgeId: null, divergingEdgeId: null,
      position: 'straight', locked: false,
      labelOffset: { ...NO_OFFSET },
      zonePropreId: null,
      discordanceStraight: false,
      discordanceDiverging: false,
    };
    set(s => ({ switches: [...s.switches, sw], selection: { type: 'switch', id: sw.id } }));
  },

  updateSwitch: (id, patch) => {
    set(s => ({ switches: s.switches.map(sw => sw.id === id ? { ...sw, ...patch } : sw) }));
  },

  deleteSwitch: (id) => {
    saveUndo();
    set(s => ({ switches: s.switches.filter(sw => sw.id !== id), selection: null }));
  },

  toggleSwitchPosition: (id) => {
    const s = get();
    const sw = s.switches.find(sw => sw.id === id);
    if (!sw) return;
    // E.Pa: block manual repositioning of any switch locked by an active route.
    if (sw.locked) return;
    // Zone propre occupée : aiguille immobile (sauf si annulateur actif sur cette zone).
    if (sw.zonePropreId && s.occupiedEffective(sw.zonePropreId)) return;
    set(prev => ({
      switches: prev.switches.map(sw =>
        sw.id === id ? { ...sw, position: sw.position === 'straight' ? 'diverging' : 'straight' } : sw
      ),
    }));
  },

  toggleSwitchLock: (id) => {
    set(s => ({
      switches: s.switches.map(sw => sw.id === id ? { ...sw, locked: !sw.locked } : sw),
    }));
  },

  setSwitchDiscordance: (id, branch, active) => {
    set(prev => {
      const patch = branch === 'straight'
        ? { discordanceStraight: active }
        : { discordanceDiverging: active };
      const updatedSwitches = prev.switches.map(sw =>
        sw.id === id ? { ...sw, ...patch } : sw,
      );

      let signals = prev.signals;

      if (active) {
        // If a route is already active and uses this branch, its signal was open →
        // discordance now causes CIA failure → close the signal (Fiche 306.4).
        // The DI alarm is NOT triggered here — the formateur is setting a hardware
        // failure; detection only occurs when a route is activated.
        for (const [routeId, ris] of Object.entries(prev.routeInterlockingStates)) {
          if (ris.buttonState !== 'active' || !ris.EPA_active) continue;
          const route = prev.routes[routeId];
          if (!route) continue;
          const requiredPos = route.switchPositions[id];
          if (requiredPos !== branch) continue; // other branch — unaffected
          signals = signals.map(sig =>
            route.signalIds.includes(sig.id)
              ? { ...sig, state: 'closed' as const }
              : sig,
          );
        }
      } else {
        // CIA may have cleared — attempt to reopen signals if ZP/ZEA also clear.
        signals = recomputeSignalOpenings(
          prev.routeInterlockingStates, prev.routes, prev.zones,
          signals, prev.trains, prev.panelButtons, updatedSwitches,
        );
      }

      // Clear the DI alarm once all discordances are resolved
      const noMoreDiscordance = updatedSwitches.every(
        sw => !sw.discordanceStraight && !sw.discordanceDiverging,
      );
      const diAlarmActive = noMoreDiscordance ? false : prev.diAlarmActive;

      return { switches: updatedSwitches, signals, diAlarmActive };
    });
    // No alarm here — alarm fires only in activateButton at detection time
  },

  autoAssignSwitch: (switchId) => {
    const s = get();
    const sw = s.switches.find(sw => sw.id === switchId);
    if (!sw) return;
    const node = s.nodes.find(n => n.id === sw.nodeId);
    if (!node) return;

    const connected = s.edges.filter(e =>
      e.fromNodeId === sw.nodeId || e.toNodeId === sw.nodeId
    );
    if (connected.length !== 3) return; // standard switch = exactly 3 edges

    // Angular difference between two angles (0..π)
    const angleDiff = (a: number, b: number): number => {
      const d = Math.abs(a - b) % (2 * Math.PI);
      return d > Math.PI ? 2 * Math.PI - d : d;
    };

    // Direction vector from switch node outward along each edge
    const dirs = connected.map(edge => {
      const otherId = edge.fromNodeId === sw.nodeId ? edge.toNodeId : edge.fromNodeId;
      const other   = s.nodes.find(n => n.id === otherId);
      const dx = (other?.x ?? node.x) - node.x;
      const dy = (other?.y ?? node.y) - node.y;
      return { edge, angle: Math.atan2(dy, dx) };
    });

    const [d0, d1, d2] = dirs;
    const diff01 = angleDiff(d0.angle, d1.angle);
    const diff02 = angleDiff(d0.angle, d2.angle);
    const diff12 = angleDiff(d1.angle, d2.angle);

    // The two branches that are closest together = forward (straight + diverging)
    // The remaining one = entry
    let entryDir: typeof dirs[0], fwd1: typeof dirs[0], fwd2: typeof dirs[0];
    if (diff12 <= diff01 && diff12 <= diff02) {
      entryDir = d0; fwd1 = d1; fwd2 = d2;
    } else if (diff02 <= diff01 && diff02 <= diff12) {
      entryDir = d1; fwd1 = d0; fwd2 = d2;
    } else {
      entryDir = d2; fwd1 = d0; fwd2 = d1;
    }

    // Among the two forward branches, the one most aligned with
    // the continuation of the entry (anti-parallel) = straight
    const continuation = entryDir.angle + Math.PI;
    const straightDir  = angleDiff(fwd1.angle, continuation) <= angleDiff(fwd2.angle, continuation)
      ? fwd1 : fwd2;
    const divergingDir = straightDir === fwd1 ? fwd2 : fwd1;

    set(prev => ({
      switches: prev.switches.map(sw => sw.id === switchId ? {
        ...sw,
        entryEdgeId:     entryDir.edge.id,
        straightEdgeId:  straightDir.edge.id,
        divergingEdgeId: divergingDir.edge.id,
      } : sw),
    }));
  },

  // ── TextLabels ─────────────────────────────────────────────────────────────

  addTextLabel: (x, y) => {
    saveUndo();
    const lbl: TextLabel = { id: uid(), text: 'Texte', x, y, fontSize: 14 };
    set(s => ({ textLabels: [...s.textLabels, lbl], selection: { type: 'textLabel', id: lbl.id } }));
  },

  updateTextLabel: (id, patch) => {
    set(s => ({ textLabels: s.textLabels.map(t => t.id === id ? { ...t, ...patch } : t) }));
  },

  deleteTextLabel: (id) => {
    saveUndo();
    set(s => ({ textLabels: s.textLabels.filter(t => t.id !== id), selection: null }));
  },

  // ── PupitreLabels ────────────────────────────────────────────────────────────

  addPupitreLabel: (x, y) => {
    const lbl: PupitreLabel = { id: uid(), text: 'Libellé', x, y, w: 100, h: 36 };
    set(s => ({ pupitreLabels: [...s.pupitreLabels, lbl] }));
  },

  updatePupitreLabel: (id, patch) => {
    set(s => ({ pupitreLabels: s.pupitreLabels.map(l => l.id === id ? { ...l, ...patch } : l) }));
  },

  deletePupitreLabel: (id) => {
    set(s => ({ pupitreLabels: s.pupitreLabels.filter(l => l.id !== id) }));
  },

  // ── Routes (logique métier pure) ──────────────────────────────────────────

  addRoute: (routeDef) => {
    saveUndo();
    const route: Route = { id: uid(), ...routeDef };
    set(s => ({ routes: { ...s.routes, [route.id]: route } }));
    return route.id;
  },

  updateRoute: (id, patch) => {
    set(s => {
      const route = s.routes[id];
      if (!route) return {};
      return { routes: { ...s.routes, [id]: { ...route, ...patch } } };
    });
  },

  setRouteApproachZone: (routeId, zoneId) => {
    set(s => {
      const route = s.routes[routeId];
      if (!route) return {};
      // Remove 'approche' from any existing zone condition that has it
      let conds = route.zoneConditions.map(c => ({
        ...c,
        roles: c.roles.filter(r => r !== 'approche') as typeof c.roles,
      })).filter(c => c.roles.length > 0 || c.zoneId === zoneId);

      if (zoneId) {
        const existing = conds.find(c => c.zoneId === zoneId);
        if (existing) {
          // Add 'approche' role to existing condition
          conds = conds.map(c =>
            c.zoneId === zoneId
              ? { ...c, roles: [...c.roles, 'approche' as const] }
              : c
          );
        } else {
          // Create new condition with only 'approche' role
          conds = [...conds, { zoneId, roles: ['approche' as const] }];
        }
      }

      return { routes: { ...s.routes, [routeId]: { ...route, zoneConditions: conds } } };
    });
  },

  removeRoute: (id) => {
    saveUndo();
    set(s => {
      const { [id]: _removed, ...rest } = s.routes;
      // Détacher les boutons qui référencent cette route
      const panelButtons = Object.fromEntries(
        Object.entries(s.panelButtons).map(([bid, btn]) =>
          [bid, btn.routeId === id ? { ...btn, routeId: null, state: 'idle' as ButtonState } : btn]
        )
      );
      return { routes: rest, panelButtons };
    });
  },

  // ── PanelButtons ───────────────────────────────────────────────────────────

  addPanelButton: (type = 'route') => {
    saveUndo();
    const s = get();
    const COLS = 4;
    const occupied = new Set(
      Object.values(s.panelButtons).map(b => `${b.row},${b.col}`)
    );
    let row = 0, col = 0;
    while (occupied.has(`${row},${col}`)) {
      col++;
      if (col >= COLS) { col = 0; row++; }
    }
    const btn: PanelButton = {
      id: uid(),
      label: type === 'fc' ? 'FC' : type === 'annulateur' ? 'ANN' : 'BTN',
      type,
      routeId: null,
      fcSignalId: null,
      annulateurZoneIds: [],
      col, row,
      state: 'idle',
      reflexions: [],
    };
    set(prev => ({ panelButtons: { ...prev.panelButtons, [btn.id]: btn } }));
    return btn.id;
  },

  updatePanelButton: (id, patch) => {
    set(s => {
      const btn = s.panelButtons[id];
      if (!btn) return {};
      return { panelButtons: { ...s.panelButtons, [id]: { ...btn, ...patch } } };
    });
  },

  removePanelButton: (id) => {
    saveUndo();
    set(s => {
      const { [id]: _removed, ...rest } = s.panelButtons;
      return { panelButtons: rest };
    });
  },

  toggleBlinkPhase:  () => set(s => ({ blinkPhase: !s.blinkPhase })),
  setDiIndicatorPos: (pos) => set({ diIndicatorPos: pos }),

  toggleZoneOccupied: (zoneId) => {
    set(prev => {
      const zones = prev.zones.map(z =>
        z.id === zoneId ? { ...z, occupiedManual: !z.occupiedManual } : z
      );
      const newRis    = recomputeEApStates(prev.routeInterlockingStates, prev.routes, zones, prev.trains, prev.panelButtons);
      const eapSigs   = applyEApToSignals(prev.routeInterlockingStates, newRis, prev.routes, prev.signals);
      const finalSigs = recomputeSignalOpenings(newRis, prev.routes, zones, eapSigs, prev.trains, prev.panelButtons, prev.switches);
      return { zones, routeInterlockingStates: newRis, signals: finalSigs };
    });
  },

  setZoneDerangement: (zoneId, active) => {
    set(prev => {
      const zones = prev.zones.map(z =>
        z.id === zoneId
          ? { ...z, derangement: active, annulled: active ? z.annulled : false }
          : z
      );
      const newRis    = recomputeEApStates(prev.routeInterlockingStates, prev.routes, zones, prev.trains, prev.panelButtons);
      const eapSigs   = applyEApToSignals(prev.routeInterlockingStates, newRis, prev.routes, prev.signals);
      const finalSigs = recomputeSignalOpenings(newRis, prev.routes, zones, eapSigs, prev.trains, prev.panelButtons, prev.switches);
      return { zones, routeInterlockingStates: newRis, signals: finalSigs };
    });
  },

  annulZone: (zoneId) => {
    set(prev => {
      const zones = prev.zones.map(z =>
        z.id === zoneId && z.derangement ? { ...z, annulled: true } : z
      );
      const newRis    = recomputeEApStates(prev.routeInterlockingStates, prev.routes, zones, prev.trains, prev.panelButtons);
      const eapSigs   = applyEApToSignals(prev.routeInterlockingStates, newRis, prev.routes, prev.signals);
      const finalSigs = recomputeSignalOpenings(newRis, prev.routes, zones, eapSigs, prev.trains, prev.panelButtons, prev.switches);
      return { zones, routeInterlockingStates: newRis, signals: finalSigs };
    });
  },

  cancelZoneAnnulment: (zoneId) => {
    set(prev => {
      const zones = prev.zones.map(z =>
        z.id === zoneId ? { ...z, annulled: false } : z
      );
      const newRis    = recomputeEApStates(prev.routeInterlockingStates, prev.routes, zones, prev.trains, prev.panelButtons);
      const eapSigs   = applyEApToSignals(prev.routeInterlockingStates, newRis, prev.routes, prev.signals);
      const finalSigs = recomputeSignalOpenings(newRis, prev.routes, zones, eapSigs, prev.trains, prev.panelButtons, prev.switches);
      return { zones, routeInterlockingStates: newRis, signals: finalSigs };
    });
  },

  getZoneAnnulmentType: (zoneId) => {
    const s = get();
    return getZoneAnnulmentType(zoneId, s.routes, s.switches);
  },

  // ── Interlocking ───────────────────────────────────────────────────────────

  occupiedEffective: (zoneId) => {
    const s = get();
    // Annulateur actif sur cette zone → considérée libre
    const annulatedIds = getAnnulatedZoneIds(s.panelButtons);
    if (annulatedIds.has(zoneId)) return false;
    const zone = s.zones.find(z => z.id === zoneId);
    if (!zone) return false;
    if (zone.derangement && zone.annulled) return false; // Ann. Zone: EE neutralized
    if (zone.derangement || zone.occupiedManual) return true;
    return s.trains.some(t => t.state !== 'terminated' && zone.edgeIds.includes(t.edgeId));
  },

  getRouteZoneConditions: (routeId) => {
    return get().routes[routeId]?.zoneConditions ?? [];
  },

  getZonesByRole: (routeId, role) => {
    const conditions = get().routes[routeId]?.zoneConditions ?? [];
    const matching = conditions.filter(c => c.roles.includes(role));
    if (role === 'transit') {
      matching.sort((a, b) => (a.transitIndex ?? 0) - (b.transitIndex ?? 0));
    }
    return matching.map(c => c.zoneId);
  },

  pressButton: (buttonId) => {
    const s = get();
    const button = s.panelButtons[buttonId];
    if (!button) return;

    const setButtonState = (newState: ButtonState) =>
      set(prev => ({
        panelButtons: { ...prev.panelButtons, [buttonId]: { ...button, state: newState } },
      }));

    // ── Annulateur button : toggle active/idle + recompute EAp + signals ────────
    if (button.type === 'annulateur') {
      const newState: ButtonState = button.state === 'active' ? 'idle' : 'active';
      set(prev => {
        const newButtons = { ...prev.panelButtons, [buttonId]: { ...button, state: newState } };
        const newRis    = recomputeEApStates(prev.routeInterlockingStates, prev.routes, prev.zones, prev.trains, newButtons);
        const eapSigs   = applyEApToSignals(prev.routeInterlockingStates, newRis, prev.routes, prev.signals);
        const finalSigs = recomputeSignalOpenings(newRis, prev.routes, prev.zones, eapSigs, prev.trains, newButtons, prev.switches);
        return {
          panelButtons: newButtons,
          routeInterlockingStates: newRis,
          signals: finalSigs,
        };
      });
      return;
    }

    // ── FC button : ferme le signal à l'activation, le rouvre à la désactivation
    if (button.type === 'fc') {
      const newFcState = button.state === 'active' ? 'idle' : 'active';
      const sigId = button.fcSignalId;

      let updatedSignals = s.signals;

      if (sigId) {
        if (newFcState === 'active') {
          // FC force la fermeture du signal sans condition — y compris sur maintained_open.
          // C'est précisément le rôle de la FC en présence d'E.Ap : passer outre.
          updatedSignals = s.signals.map(sig =>
            sig.id === sigId ? { ...sig, state: 'closed' as const } : sig
          );
        } else {
          // Libération de la FC : recalcule l'état du signal selon E.Pa + E.Ap actifs.
          const activeRoute = Object.values(s.panelButtons).find(
            b => b.state === 'active' && b.type !== 'fc' && b.routeId &&
                 s.routes[b.routeId]?.signalIds.includes(sigId)
          );
          if (activeRoute) {
            const ris = s.routeInterlockingStates[activeRoute.routeId!];
            const openState = ris?.EAP_active ? 'maintained_open' as const : 'open' as const;
            updatedSignals = s.signals.map(sig =>
              sig.id === sigId ? { ...sig, state: openState } : sig
            );
          }
        }
      }

      set(prev => ({
        signals: updatedSignals,
        panelButtons: { ...prev.panelButtons, [buttonId]: { ...button, state: newFcState } },
      }));
      return;
    }

    // ── Route button ─────────────────────────────────────────────────────────
    switch (button.state) {
      case 'idle': {
        if (!button.routeId || !s.routes[button.routeId]) return;
        const route = s.routes[button.routeId];
        // skipCIA:   switches are positioned by activateButton — not a gate at formation start.
        // skipZPZEA: ZP/ZEA only gate signal opening, not route formation.
        //            The route forms, E.Pa engages, switches lock; signal opens later
        //            automatically when ZP/ZEA clears (via recomputeSignalOpenings).
        const result = canFormItineraire(
          route,
          s.switches,
          buildActiveEdgeIds(s, buttonId),
          buildCtx(s),
          { skipCIA: true, skipZPZEA: true },
        );
        if (!result.canForm) {
          const newRouteType = route.routeType ?? 'DA';
          const blockType = classifyFormationBlock(result, s.panelButtons, s.routes, buttonId, newRouteType);
          const routeId = button.routeId!;
          if (blockType === 'conflict') {
            set(prev => ({
              panelButtons:    { ...prev.panelButtons, [buttonId]: { ...button, state: 'conflict' } },
              conflictDetails: { ...prev.conflictDetails, [buttonId]: result },
            }));
          } else {
            // registered or overregistered: store RIS for FIFO ordering
            set(prev => ({
              panelButtons: { ...prev.panelButtons, [buttonId]: { ...button, state: blockType } },
              routeInterlockingStates: {
                ...prev.routeInterlockingStates,
                [routeId]: initialInterlockingState(routeId, blockType),
              },
            }));
          }
        } else {
          const routeId = button.routeId!;
          set(prev => ({
            panelButtons:            { ...prev.panelButtons, [buttonId]: { ...button, state: 'forming' } },
            conflictDetails:         omitKey(prev.conflictDetails, buttonId),
            routeInterlockingStates: {
              ...prev.routeInterlockingStates,
              [routeId]: initialInterlockingState(routeId),
            },
          }));
        }
        break;
      }
      case 'forming': {
        // Second clic : annuler la formation
        const routeId = button.routeId ?? '';
        set(prev => ({
          panelButtons:            { ...prev.panelButtons, [buttonId]: { ...button, state: 'idle' } },
          conflictDetails:         omitKey(prev.conflictDetails, buttonId),
          routeInterlockingStates: omitKey(prev.routeInterlockingStates, routeId),
        }));
        break;
      }
      case 'registered':
      case 'overregistered': {
        // Annulation de l'enregistrement/surenregistrement.
        // Si on libère le premier slot (registered), un surenregistré FIFO
        // derrière doit pouvoir être promu à registered (ou directement à
        // forming si les conditions le permettent).
        const routeId = button.routeId ?? '';
        set(prev => {
          const cancelledButtons = { ...prev.panelButtons, [buttonId]: { ...button, state: 'idle' as ButtonState } };
          const cancelledRis     = omitKey(prev.routeInterlockingStates, routeId);
          const activation = tryActivateRegistered(
            cancelledButtons, prev.routes, prev.zones, prev.switches, prev.trains, cancelledRis,
          );
          return {
            panelButtons:            activation?.panelButtons            ?? cancelledButtons,
            routeInterlockingStates: activation?.routeInterlockingStates ?? cancelledRis,
          };
        });
        break;
      }
      case 'active': {
        const routeId = button.routeId ?? '';
        const route   = s.routes[routeId];
        const ris     = s.routeInterlockingStates[routeId];

        // ── E.Ap active: séquence DMT ────────────────────────────────────────
        //
        // Séquence (V1 — simplifications déclarées) :
        //   1. Premier geste  : FC demandée + Demande de destruction + Constatation
        //                       (trois étapes fusionnées en V1 — signal reste maintained_open)
        //                       → DM_startTime posé, délai démarre
        //   2. Délai (3 min)  : destruction bloquée, signal toujours maintained_open
        //   3. Deuxième geste : Ann. EAp → signal fermé + itinéraire détruit
        //
        if (ris?.EAP_active) {
          // ── Vérification FC préalable ────────────────────────────────────────
          // En présence d'E.Ap, la destruction manuelle est subordonnée à la pose
          // de la FC (Fermeture de Contrôle) sur le signal de l'itinéraire.
          // Sans FC active, le geste est silencieusement ignoré.
          const routeSignalIds = new Set(route?.signalIds ?? []);
          const fcIsActive = Object.values(s.panelButtons).some(
            b => b.type === 'fc' && b.state === 'active'
              && b.fcSignalId !== null && routeSignalIds.has(b.fcSignalId),
          );
          if (!fcIsActive) return; // FC obligatoire avant toute DMT

          if (ris.DM_startTime === null) {
            // Premier geste : démarrage du délai DMT.
            // La FC est posée → le signal est déjà fermé ou maintenu.
            // On enregistre le timestamp de début du délai obligatoire.
            set(prev => ({
              routeInterlockingStates: {
                ...prev.routeInterlockingStates,
                [routeId]: { ...ris, DM_startTime: Date.now() },
              },
            }));
            return;
          }

          if (Date.now() - ris.DM_startTime < DMT_DELAY_MS) {
            // Délai non expiré — geste ignoré
            return;
          }

          // Délai expiré : deuxième geste = Ann. EAp (fall-through vers la libération ci-dessous)
          // Effets produits par la libération :
          //   1. EAP_active annulé   — omitKey(routeInterlockingStates, routeId)
          //   2. Signal fermé        — maintained_open → closed pour chaque signalId de la route
          //   3. Itinéraire détruit  — bouton → 'idle'
          //   4. Verrous libérés     — sw.locked = false pour chaque aiguille de la route
        }

        // ── Libérer l'itinéraire (normal ou Ann. EAp après DMT) ─────────────
        if (!route) { setButtonState('idle'); break; }

        const otherActive = Object.values(s.panelButtons)
          .filter(b => b.state === 'active' && b.id !== buttonId && b.routeId);
        const sharedSignalIds = new Set(
          otherActive.flatMap(b => s.routes[b.routeId!]?.signalIds ?? [])
        );
        const sharedSwitchIds = new Set(
          otherActive.flatMap(b => Object.keys(s.routes[b.routeId!]?.switchPositions ?? {}))
        );

        const updatedSignals = s.signals.map(sig =>
          route.signalIds.includes(sig.id) && !sharedSignalIds.has(sig.id)
            ? { ...sig, state: 'closed' as const } : sig
        );
        const updatedSwitches = s.switches.map(sw =>
          route.switchPositions[sw.id] !== undefined && !sharedSwitchIds.has(sw.id)
            ? { ...sw, locked: false } : sw
        );
        set(prev => {
          const destroyedButtons = { ...prev.panelButtons, [buttonId]: { ...button, state: 'idle' as ButtonState } };
          const destroyedRis     = omitKey(prev.routeInterlockingStates, routeId);
          // Attempt to unblock registered/overregistered routes now that resources are freed
          const activation = tryActivateRegistered(
            destroyedButtons, prev.routes, prev.zones, updatedSwitches, prev.trains, destroyedRis,
          );
          return {
            signals:  updatedSignals,
            switches: updatedSwitches,
            panelButtons:            activation?.panelButtons            ?? destroyedButtons,
            conflictDetails:         omitKey(prev.conflictDetails, buttonId),
            routeInterlockingStates: activation?.routeInterlockingStates ?? destroyedRis,
          };
        });
        break;
      }
      case 'conflict': {
        set(prev => ({
          panelButtons:    { ...prev.panelButtons, [buttonId]: { ...button, state: 'idle' } },
          conflictDetails: omitKey(prev.conflictDetails, buttonId),
        }));
        break;
      }
    }
  },

  activateButton: (buttonId) => {
    const s = get();
    const button = s.panelButtons[buttonId];
    // Guard : le bouton doit toujours être en cours de formation
    if (!button || button.state !== 'forming' || button.type === 'fc') return;

    const route = button.routeId ? s.routes[button.routeId] : null;
    if (!route) return;

    // Position switches first — in PRS, formation commands switches to move;
    // CIA verifies AFTER positioning, not before.
    const updatedSwitches = s.switches.map(sw => {
      const pos = route.switchPositions[sw.id];
      if (pos === undefined) return sw;
      // Cannot physically move a switch whose zone propre is occupied (train or manual block).
      // Leave position unchanged — CIA will detect the mismatch and block formation.
      if (sw.zonePropreId && s.occupiedEffective(sw.zonePropreId)) {
        return { ...sw, locked: true };
      }
      return { ...sw, position: pos, locked: true };
    });

    // ── CIA check — distinguish discordance failures from position failures ─────
    //
    // After repositioning above, if a switch is in the correct position but CIA
    // still fails, the failure is due to discordance (confirmation relay dropped).
    // These are treated like ZP/ZEA: the route activates (E.Pa engages, transit
    // starts) but the signal stays closed. The DI alarm is triggered.
    //
    // If the switch was NOT repositioned (zone propre occupied → position mismatch),
    // that is a genuine blocking condition → conflict.
    const ciaFull = checkCIA(route, updatedSwitches);
    // CIA failures where position matches → discordance. Others → real blocking.
    const discordanceFailIds = ciaFull.failingSwitchIds.filter(swId => {
      const sw = updatedSwitches.find(sw => sw.id === swId);
      const reqPos = route.switchPositions[swId];
      return sw?.position === reqPos; // position correct after command → discordance
    });
    // All CIA failures are discordance-only (none are position mismatches)
    const hasPureDiscordanceCIA =
      !ciaFull.ok &&
      discordanceFailIds.length === ciaFull.failingSwitchIds.length;

    // Re-check all other formation conditions (skip CIA if only discordance fails —
    // the route will still form; the signal gate is handled separately below).
    const result = canFormItineraire(
      route,
      updatedSwitches,
      buildActiveEdgeIds(s, buttonId),
      buildCtx(s),
      { skipZPZEA: true, skipCIA: hasPureDiscordanceCIA },
    );
    if (!result.canForm) {
      set(prev => ({
        panelButtons:    { ...prev.panelButtons, [buttonId]: { ...button, state: 'conflict' } },
        conflictDetails: { ...prev.conflictDetails, [buttonId]: result },
      }));
      return;
    }

    const routeId = button.routeId!;
    const eap     = checkEAp(routeId, buildCtx(s));

    // Check ZP / ZEA — only gates signal opening, not route activation
    const zpOk  = route.zoneConditions
      .filter(c => c.roles.includes('ZP'))
      .every(c => !s.occupiedEffective(c.zoneId));
    const zeaOk = route.zoneConditions
      .filter(c => c.roles.includes('ZEA'))
      .every(c => !s.occupiedEffective(c.zoneId));

    // FC-blocked signal IDs
    const fcBlockedIds = new Set(
      Object.values(s.panelButtons)
        .filter(b => b.type === 'fc' && b.state === 'active' && b.fcSignalId)
        .map(b => b.fcSignalId!),
    );

    // Open signals only if ZP/ZEA are clear AND CIA passes AND not FC-blocked.
    // Discordance keeps signal closed even when ZP/ZEA are free (CIA fails → no opening).
    // Signal will reopen via recomputeSignalOpenings when discordance + ZP/ZEA clear.
    let updatedSignals = s.signals;
    if (zpOk && zeaOk && ciaFull.ok) {
      const openState = eap.active ? 'maintained_open' as const : 'open' as const;
      updatedSignals = s.signals.map(sig =>
        route.signalIds.includes(sig.id) && !fcBlockedIds.has(sig.id)
          ? { ...sig, state: openState } : sig,
      );
    }

    set(prev => {
      const baseRis = prev.routeInterlockingStates[routeId] ?? initialInterlockingState(routeId);
      const newRis: RouteInterlockingState = {
        ...baseRis,
        buttonState: 'active' as const,
        EPA_active:  true,
        EAP_active:  eap.active,
      };
      return {
        switches: updatedSwitches,
        signals:  updatedSignals,
        panelButtons:    { ...prev.panelButtons, [buttonId]: { ...button, state: 'active' } },
        conflictDetails: omitKey(prev.conflictDetails, buttonId),
        routeInterlockingStates: { ...prev.routeInterlockingStates, [routeId]: newRis },
        // Activate DI alarm only when discordance is first detected here
        diAlarmActive: hasPureDiscordanceCIA ? true : prev.diAlarmActive,
      };
    });

    // Play alarm at the moment of discordance detection (outside set())
    if (hasPureDiscordanceCIA) playDiscordanceAlarm();
  },

  // ── Train simulation ───────────────────────────────────────────────────────

  placeTrain: (edgeId, t) => {
    const s = get();
    if (!s.edges.find(e => e.id === edgeId)) return;
    const train: Train = {
      id: uid(), number: `${s.trains.length + 1}`.padStart(2, '0'), edgeId,
      t: Math.max(0.05, Math.min(0.95, t)),
      direction: 'AtoB', state: 'running', speed: 0.08,
      afSignalIds: [],
      running: false,
    };
    set(prev => ({ trains: [...prev.trains, train] }));
  },

  removeTrain: (trainId) => set(prev => {
    const newTrains = prev.trains.filter(t => t.id !== trainId);
    const newRis    = recomputeEApStates(prev.routeInterlockingStates, prev.routes, prev.zones, newTrains, prev.panelButtons);
    const eapSigs   = applyEApToSignals(prev.routeInterlockingStates, newRis, prev.routes, prev.signals);
    const finalSigs = recomputeSignalOpenings(newRis, prev.routes, prev.zones, eapSigs, newTrains, prev.panelButtons, prev.switches);
    return { trains: newTrains, routeInterlockingStates: newRis, signals: finalSigs };
  }),

  startSimulation: (trainId) => set(prev => ({
    trains: prev.trains.map(t =>
      t.id === trainId && t.state !== 'blocked' && t.state !== 'terminated'
        ? { ...t, running: true, state: t.state === 'waiting_signal' ? 'waiting_signal' as const : 'running' as const }
        : t
    ),
  })),

  stopSimulation: (trainId) => set(prev => ({
    trains: prev.trains.map(t => t.id === trainId ? { ...t, running: false } : t),
  })),

  setTrainNumber: (trainId, number) => set(prev => ({
    trains: prev.trains.map(t => t.id === trainId ? { ...t, number } : t),
  })),

  setTrainDirection: (trainId, direction) => set(prev => ({
    trains: prev.trains.map(t => t.id === trainId ? { ...t, direction, state: 'running' as const } : t),
  })),

  setTrainSpeed: (trainId, speed) => set(prev => ({
    trains: prev.trains.map(t => t.id === trainId ? { ...t, speed } : t),
  })),

  grantAF: (trainId, signalId) => set(prev => {
    const train = prev.trains.find(t => t.id === trainId);
    if (!train || train.afSignalIds.includes(signalId)) return {};
    const updated = { ...train, afSignalIds: [...train.afSignalIds, signalId],
      state: train.state === 'waiting_signal' ? 'running' as const : train.state };
    return { trains: prev.trains.map(t => t.id === trainId ? updated : t) };
  }),

  revokeAF: (trainId, signalId) => set(prev => ({
    trains: prev.trains.map(t =>
      t.id === trainId
        ? { ...t, afSignalIds: t.afSignalIds.filter(id => id !== signalId) }
        : t
    ),
  })),

  tickSimulation: (dt) => {
    const runningIds = get().trains
      .filter(t => t.running && t.state !== 'blocked' && t.state !== 'terminated')
      .map(t => t.id);

    for (const trainId of runningIds) {
      const s = get();
      let train = s.trains.find(t => t.id === trainId);
      if (!train || !train.running || train.state === 'blocked' || train.state === 'terminated') continue;

      // If waiting: check if blocking signal opened
      if (train.state === 'waiting_signal') {
        const blocking = getBlockingSignal(train, s.signals);
        if (blocking) continue;
        train = { ...train, state: 'running' };
        set(prev => ({ trains: prev.trains.map(t => t.id === trainId ? { ...t, state: 'running' as const } : t) }));
      }

      // Re-read after potential state update
      const s2 = get();
      const currentTrain = s2.trains.find(t => t.id === trainId);
      if (!currentTrain) continue;
      train = currentTrain;

      // Advance position
      const step = train.speed * dt;
      const edge = s2.edges.find(e => e.id === train!.edgeId);
      if (!edge) continue;

      const newT = train.direction === 'AtoB' ? train.t + step : train.t - step;

      // Check for closed signals in the path
      const blocking = getBlockingSignalInPath(train, newT, s2.signals);
      if (blocking) {
        const stopT = train.direction === 'AtoB'
          ? Math.max(train.t, blocking.position - 0.005)
          : Math.min(train.t, blocking.position + 0.005);
        set(prev => ({ trains: prev.trains.map(t => t.id === trainId ? { ...t, t: stopT, state: 'waiting_signal' as const } : t) }));
        continue;
      }

      // Consume AF for signals the train just passed over on this step
      let trainAfSignalIds = train.afSignalIds ?? [];
      if (trainAfSignalIds.length > 0) {
        const passedAfIds = s2.signals
          .filter(sig =>
            sig.edgeId === train!.edgeId &&
            sig.direction === train!.direction &&
            trainAfSignalIds.includes(sig.id) &&
            (train!.direction === 'AtoB'
              ? sig.position > train!.t && sig.position <= newT
              : sig.position < train!.t && sig.position >= newT),
          )
          .map(sig => sig.id);
        if (passedAfIds.length > 0) {
          trainAfSignalIds = trainAfSignalIds.filter(id => !passedAfIds.includes(id));
          train = { ...train, afSignalIds: trainAfSignalIds };
        }
      }

      // Check edge boundary
      const atEnd = train.direction === 'AtoB' ? newT >= 1 : newT <= 0;
      if (atEnd) {
        const exitNodeId = train.direction === 'AtoB' ? edge.toNodeId : edge.fromNodeId;
        const result = findNextEdge(exitNodeId, edge.id, s2.edges, s2.switches);
        if (!result) {
          const stoppedT     = train.direction === 'AtoB' ? 1 : 0;
          const stoppedTrain = { ...train, t: stoppedT, state: 'blocked' as const };
          const blockedEdgeId = train.edgeId;
          const blockedDir    = train.direction;

          set(prev => {
            const newTrains = prev.trains.map(t => t.id === trainId ? stoppedTrain : t);
            const { newStates: afterTransit, daRouteIds } = computeTransitClearing(
              prev.routeInterlockingStates, prev.routes, prev.zones, blockedEdgeId, '',
            );
            const afterEAp = recomputeEApStates(afterTransit, prev.routes, prev.zones, newTrains, prev.panelButtons);
            let signals      = applyEApToSignals(afterTransit, afterEAp, prev.routes, prev.signals);
            let switches     = computeProgressiveSwitchUnlocks(afterEAp, prev.routes, prev.switches);
            let panelButtons = prev.panelButtons;
            let ris          = afterEAp;

            const activeSignalIds = new Set(
              Object.values(ris)
                .filter(r => r.buttonState === 'active')
                .flatMap(r => prev.routes[r.routeId]?.signalIds ?? []),
            );
            signals = signals.map(sig => {
              if (sig.edgeId !== blockedEdgeId) return sig;
              if (!activeSignalIds.has(sig.id))  return sig;
              if (sig.direction !== blockedDir)  return sig;
              if (sig.state !== 'open')          return sig;
              return { ...sig, state: 'closed' as const };
            });

            for (const routeId of daRouteIds) {
              const route = prev.routes[routeId];
              if (!route) continue;
              const isTP = (route.routeType ?? 'DA') === 'TP';
              if (isTP) {
                const currentRis = ris[routeId];
                if (currentRis) ris = { ...ris, [routeId]: { ...currentRis, transitCleared: [] } };
                continue;
              }
              const btn = Object.values(prev.panelButtons).find(b => b.routeId === routeId && b.state === 'active');
              if (!btn) continue;
              const otherActive = Object.values(prev.panelButtons).filter(b => b.state === 'active' && b.id !== btn.id && b.routeId);
              const sharedSigIds = new Set(otherActive.flatMap(b => prev.routes[b.routeId!]?.signalIds ?? []));
              const sharedSwIds  = new Set(otherActive.flatMap(b => Object.keys(prev.routes[b.routeId!]?.switchPositions ?? {})));
              signals  = signals.map(sig => route.signalIds.includes(sig.id) && !sharedSigIds.has(sig.id) ? { ...sig, state: 'closed' as const } : sig);
              switches = switches.map(sw  => route.switchPositions[sw.id] !== undefined && !sharedSwIds.has(sw.id) ? { ...sw, locked: false } : sw);
              panelButtons = { ...panelButtons, [btn.id]: { ...btn, state: 'idle' as const } };
              ris = omitKey(ris, routeId);
            }

            signals = recomputeSignalOpenings(ris, prev.routes, prev.zones, signals, newTrains, prev.panelButtons, switches);

            const activation = tryActivateRegistered(panelButtons, prev.routes, prev.zones, switches, newTrains, ris);
            if (activation) {
              panelButtons = activation.panelButtons;
              ris          = activation.routeInterlockingStates;
            }

            return { trains: newTrains, signals, switches, panelButtons, routeInterlockingStates: ris };
          });
          continue;
        }

        const { nextEdge, nextDirection } = result;
        const startT   = nextDirection === 'AtoB' ? 0 : 1;
        const prevEdgeId = train.edgeId;
        const nextTrain  = { ...train, edgeId: nextEdge.id, t: startT, direction: nextDirection };

        set(prev => {
          const newTrains = prev.trains.map(t => t.id === trainId ? nextTrain : t);
          const { newStates: afterTransit, daRouteIds } = computeTransitClearing(
            prev.routeInterlockingStates, prev.routes, prev.zones, prevEdgeId, nextEdge.id
          );
          const afterEAp = recomputeEApStates(afterTransit, prev.routes, prev.zones, newTrains, prev.panelButtons);
          let signals  = applyEApToSignals(afterTransit, afterEAp, prev.routes, prev.signals);
          let switches = computeProgressiveSwitchUnlocks(afterEAp, prev.routes, prev.switches);
          {
            const activeSignalIds = new Set(
              Object.values(afterEAp).filter(r => r.buttonState === 'active').flatMap(r => prev.routes[r.routeId]?.signalIds ?? []),
            );
            signals = signals.map(sig => {
              if (sig.edgeId !== prevEdgeId)         return sig;
              if (!activeSignalIds.has(sig.id))      return sig;
              if (sig.direction !== train.direction) return sig;
              if (sig.state !== 'open')              return sig;
              return { ...sig, state: 'closed' as const };
            });
          }
          let panelButtons = prev.panelButtons;
          let ris = afterEAp;

          for (const routeId of daRouteIds) {
            const route = prev.routes[routeId];
            if (!route) continue;
            const isTP = (route.routeType ?? 'DA') === 'TP';
            if (isTP) {
              const currentRis = ris[routeId];
              if (currentRis) ris = { ...ris, [routeId]: { ...currentRis, transitCleared: [] } };
              continue;
            }
            const btn = Object.values(prev.panelButtons).find(b => b.routeId === routeId && b.state === 'active');
            if (!btn) continue;
            const otherActive = Object.values(prev.panelButtons).filter(b => b.state === 'active' && b.id !== btn.id && b.routeId);
            const sharedSigIds = new Set(otherActive.flatMap(b => prev.routes[b.routeId!]?.signalIds ?? []));
            const sharedSwIds  = new Set(otherActive.flatMap(b => Object.keys(prev.routes[b.routeId!]?.switchPositions ?? {})));
            signals  = signals.map(sig => route.signalIds.includes(sig.id) && !sharedSigIds.has(sig.id) ? { ...sig, state: 'closed' as const } : sig);
            switches = switches.map(sw  => route.switchPositions[sw.id] !== undefined && !sharedSwIds.has(sw.id) ? { ...sw, locked: false } : sw);
            panelButtons = { ...panelButtons, [btn.id]: { ...btn, state: 'idle' as const } };
            ris = omitKey(ris, routeId);
          }

          signals = recomputeSignalOpenings(ris, prev.routes, prev.zones, signals, newTrains, prev.panelButtons, switches);

          const activation = tryActivateRegistered(panelButtons, prev.routes, prev.zones, switches, newTrains, ris);
          if (activation) {
            panelButtons = activation.panelButtons;
            ris          = activation.routeInterlockingStates;
          }

          return { trains: newTrains, signals, switches, panelButtons, routeInterlockingStates: ris };
        });
        continue;
      }

      // Simple position update
      set(prev => ({ trains: prev.trains.map(t => t.id === trainId ? { ...t, t: newT, afSignalIds: trainAfSignalIds } : t) }));
    }
  },

  // ── UI ─────────────────────────────────────────────────────────────────────

  setMode:       (mode) => set({ mode, pendingEdge: null, selection: null }),
  setSelection:  (obj)  => set({ selection: obj }),
  setPendingEdge: (p)   => set({ pendingEdge: p }),
  setTestZoneActive:    (v) => set({ testZoneActive: v }),
  setTestAiguilleActive: (v) => set({ testAiguilleActive: v }),

  // ── Persistence ────────────────────────────────────────────────────────────

  exportLayout: () => {
    const { nodes, edges, zones, signals, switches, textLabels, pupitreLabels, routes, panelButtons } = get();
    return JSON.stringify({ nodes, edges, zones, signals, switches, textLabels, pupitreLabels, routes, panelButtons }, null, 2);
  },

  loadLayout: ({ nodes, edges, zones, signals, switches, textLabels, routes, panelButtons, ...rest }) => {
    const pupitreLabels = (rest as any).pupitreLabels ?? [];
    // Build routeInterlockingStates: one idle entry per button that has a routeId
    const importedButtons = panelButtons ?? {};
    const importedRoutes  = routes ?? {};
    const restoredRis: Record<string, RouteInterlockingState> = {};
    for (const btn of Object.values(importedButtons)) {
      if (btn.routeId && importedRoutes[btn.routeId]) {
        restoredRis[btn.routeId] = {
          routeId:          btn.routeId,
          buttonState:      'idle',
          formingStartTime: null,
          EPA_active:       false,
          EAP_active:       false,
          transitCleared:   [],
          DM_startTime:     null,
          DM_confirmed:     false,
        };
      }
    }

    set({
      nodes:     nodes.map(n  => ({ ...n,  labelOffset: n.labelOffset  ?? { ...NO_OFFSET } })),
      edges,
      zones:     zones.map(z  => ({ ...z,  labelOffset: z.labelOffset  ?? { ...NO_OFFSET }, derangement: (z as any).derangement ?? false, annulled: (z as any).annulled ?? false })),
      signals:   signals.map(s => ({ ...s,  labelOffset: s.labelOffset  ?? { ...NO_OFFSET } })),
      switches:  (switches ?? []).map(sw => ({ ...sw, labelOffset: sw.labelOffset ?? { ...NO_OFFSET }, discordanceStraight: false, discordanceDiverging: false })),
      textLabels: textLabels ?? [],
      pupitreLabels,
      routes:     importedRoutes,
      panelButtons: importedButtons,
      routeInterlockingStates: restoredRis,
      conflictDetails: {},
      diAlarmActive:   false,
      trains: [],
      selection:   null,
      mode:        'select',
      pendingEdge: null,
      undoStack:   [],
    });
  },

  // ── Undo ─────────────────────────────────────────────────────────────────────

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1];
    set({
      ...snapshot,
      undoStack: undoStack.slice(0, -1),
    });
  },

  }; // end return
}); // end create

// Expose store on window for browser-based testing (dev only)
if (typeof window !== 'undefined') {
  (window as any).__prsStore = useRailwayStore;
}
