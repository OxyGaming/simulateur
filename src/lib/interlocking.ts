/**
 * Pure interlocking logic — no store dependency.
 *
 * Functions receive explicit parameters so they are testable in isolation.
 * Wire to the store by passing store getters as the InterlockingContext:
 *
 *   const ctx: InterlockingContext = {
 *     occupiedEffective: store.occupiedEffective,
 *     getZonesByRole:    store.getZonesByRole,
 *   };
 */

import { Route, Switch, ZoneRole } from '@/types/railway';

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * The two store primitives that interlocking logic depends on.
 * Passed explicitly so these functions never import from the store.
 */
export interface InterlockingContext {
  occupiedEffective: (zoneId: string) => boolean;
  getZonesByRole: (routeId: string, role: ZoneRole) => string[];
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface CIAResult {
  ok: boolean;
  /** Switch IDs not currently in the position required by the route. */
  failingSwitchIds: string[];
}

export interface ZoneCheckResult {
  ok: boolean;
  /** Zone IDs that are occupied and therefore blocking. */
  occupiedZoneIds: string[];
}

export interface EApResult {
  /** True when at least one approach zone is occupied (E.Ap is active). */
  active: boolean;
  /** The occupied approach zone IDs. */
  occupiedZoneIds: string[];
}

export interface SwitchConflictResult {
  ok: boolean;
  /** Switch IDs locked by another active route in the wrong position. */
  conflictingSwitchIds: string[];
}

export interface CanFormResult {
  canForm: boolean;
  blocking: {
    cia: CIAResult;
    zp: ZoneCheckResult;
    zea: ZoneCheckResult;
    switchConflict: SwitchConflictResult;
    /** True when another active route already occupies one of this route's edges. */
    edgeConflict: boolean;
  };
}

// ─── Contrôle Impératif d'Aiguille ────────────────────────────────────────────

/**
 * CIA — Contrôle Impératif d'Aiguille (permanent, PRS).
 *
 * Verifies that every switch required by the route is currently in the
 * required position. In a PRS all CIA is permanent: a loss of position
 * while the signal is open must cause it to close.
 *
 * Does NOT check lock state — use checkSwitchConflict for that.
 */
export function checkCIA(route: Route, switches: Switch[]): CIAResult {
  const failingSwitchIds: string[] = [];

  for (const [switchId, requiredPosition] of Object.entries(route.switchPositions)) {
    const sw = switches.find(s => s.id === switchId);
    if (!sw) { failingSwitchIds.push(switchId); continue; }

    // CIA fails when the required branch has lost positional control (discordance),
    // regardless of the physical position — the software cannot confirm the switch is set.
    const branchDiscordance =
      requiredPosition === 'straight' ? sw.discordanceStraight : sw.discordanceDiverging;

    if (sw.position !== requiredPosition || branchDiscordance) {
      failingSwitchIds.push(switchId);
    }
  }

  return {
    ok: failingSwitchIds.length === 0,
    failingSwitchIds,
  };
}

// ─── Zone de Protection ───────────────────────────────────────────────────────

/**
 * ZP — Zone de Protection.
 *
 * Blocks signal opening if any ZP zone of the route is occupied.
 * Fault procedure (derangement): field recognition mandatory before override.
 */
export function checkZP(routeId: string, ctx: InterlockingContext): ZoneCheckResult {
  return checkZoneRole(routeId, 'ZP', ctx);
}

// ─── Zone d'Espacement Automatique ────────────────────────────────────────────

/**
 * ZEA — Zone d'Espacement Automatique.
 *
 * Same blocking effect as ZP: signal cannot open if any ZEA zone is occupied.
 * Fault procedure (derangement): no field recognition required.
 */
export function checkZEA(routeId: string, ctx: InterlockingContext): ZoneCheckResult {
  return checkZoneRole(routeId, 'ZEA', ctx);
}

// ─── Enclenchement d'Approche ─────────────────────────────────────────────────

/**
 * E.Ap — Enclenchement d'Approche.
 *
 * Returns whether the approach interlocking is currently active, i.e. a train
 * is present in the approach zone of this route.
 *
 * When active, Destruction Manuelle is blocked until the zone clears or a
 * timed manual override is completed (FC + 3 min delay + 2nd gesture).
 *
 * This is a STATE check, not a condition that blocks route formation.
 */
export function checkEAp(routeId: string, ctx: InterlockingContext): EApResult {
  const zoneIds = ctx.getZonesByRole(routeId, 'approche');
  const occupiedZoneIds = zoneIds.filter(zid => ctx.occupiedEffective(zid));

  return {
    active: occupiedZoneIds.length > 0,
    occupiedZoneIds,
  };
}

// ─── Switch conflict ──────────────────────────────────────────────────────────

/**
 * Switch conflict check.
 *
 * A conflict exists when a required switch is already locked by another
 * active route AND in the wrong position. This prevents route formation
 * because the switch cannot be repositioned while locked.
 *
 * Distinct from CIA: CIA checks current position regardless of lock state;
 * this checks whether the position can be changed at all.
 */
export function checkSwitchConflict(
  route: Route,
  switches: Switch[],
): SwitchConflictResult {
  const conflictingSwitchIds: string[] = [];

  for (const [switchId, requiredPosition] of Object.entries(route.switchPositions)) {
    const sw = switches.find(s => s.id === switchId);
    if (sw?.locked && sw.position !== requiredPosition) {
      conflictingSwitchIds.push(switchId);
    }
  }

  return {
    ok: conflictingSwitchIds.length === 0,
    conflictingSwitchIds,
  };
}

// ─── canFormItineraire ────────────────────────────────────────────────────────

/**
 * Aggregates all conditions that must pass before a route can be activated
 * (button transitions from 'forming' to 'active').
 *
 * Individual blocking fields are exposed so callers can display granular
 * feedback without re-running each check separately.
 *
 * @param route          The route to form.
 * @param switches       Current switch states.
 * @param activeEdgeIds  Edge IDs already used by other currently active routes.
 * @param ctx            Interlocking context.
 * @param options.skipCIA    When true, CIA is not evaluated as a blocking condition.
 *                           Used at pressButton time: switches are positioned later
 *                           by activateButton, so CIA cannot yet be satisfied.
 *                           In PRS, CIA is a permanent check during the active phase,
 *                           not a gate at formation start.
 * @param options.skipZPZEA  When true, ZP and ZEA are not evaluated as blocking conditions.
 *                           In PRS, ZP/ZEA only gate signal opening, not route formation.
 *                           The route can form and E.Pa can engage even if ZP/ZEA is occupied;
 *                           the signal simply stays closed until the zone clears.
 */
export function canFormItineraire(
  route: Route,
  switches: Switch[],
  activeEdgeIds: ReadonlySet<string>,
  ctx: InterlockingContext,
  options: { skipCIA?: boolean; skipZPZEA?: boolean } = {},
): CanFormResult {
  const cia            = options.skipCIA
    ? { ok: true, failingSwitchIds: [] }
    : checkCIA(route, switches);
  const zp             = options.skipZPZEA
    ? { ok: true, occupiedZoneIds: [] }
    : checkZP(route.id, ctx);
  const zea            = options.skipZPZEA
    ? { ok: true, occupiedZoneIds: [] }
    : checkZEA(route.id, ctx);
  const switchConflict = checkSwitchConflict(route, switches);
  const edgeConflict   = route.edgeIds.some(eid => activeEdgeIds.has(eid));

  const canForm =
    cia.ok &&
    zp.ok &&
    zea.ok &&
    switchConflict.ok &&
    !edgeConflict;

  return {
    canForm,
    blocking: { cia, zp, zea, switchConflict, edgeConflict },
  };
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function checkZoneRole(
  routeId: string,
  role: ZoneRole,
  ctx: InterlockingContext,
): ZoneCheckResult {
  const zoneIds = ctx.getZonesByRole(routeId, role);
  const occupiedZoneIds = zoneIds.filter(zid => ctx.occupiedEffective(zid));

  return {
    ok: occupiedZoneIds.length === 0,
    occupiedZoneIds,
  };
}

// ─── Zone Annulment ───────────────────────────────────────────────────────────

/**
 * Type of annulation procedure required for a zone in derangement.
 *
 * ZI  — Zone d'Itinéraire / zone d'aiguille (covers a switch): examen terrain
 * ZP  — Zone de Protection: reconnaissance terrain
 * ZEA — Zone d'Espacement Automatique: annulation directe (no terrain check)
 * null — zone plays no interlocking role in any route
 */
export type AnnulmentType = 'ZI' | 'ZP' | 'ZEA' | null;

/**
 * Determine the most restrictive annulment procedure required for a given zone,
 * based on the roles it plays across all routes and whether it covers a switch.
 *
 * Priority: ZI > ZP > ZEA > null
 */
export function getZoneAnnulmentType(
  zoneId:   string,
  routes:   Record<string, Route>,
  switches: Switch[],
): AnnulmentType {
  // ZI: zone covers a switch (zonePropreId points to the zone)
  if (switches.some(sw => sw.zonePropreId === zoneId)) return 'ZI';

  // Scan all routes for the most restrictive role
  let type: 'ZP' | 'ZEA' | null = null;
  for (const route of Object.values(routes)) {
    for (const cond of route.zoneConditions) {
      if (cond.zoneId !== zoneId) continue;
      if (cond.roles.includes('ZP')) { type = 'ZP'; break; }
      if (cond.roles.includes('ZEA') && type === null) type = 'ZEA';
    }
    if (type === 'ZP') break; // ZP is more restrictive than ZEA
  }
  return type;
}
