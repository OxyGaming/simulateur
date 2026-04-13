'use client';
import { useEffect, useRef, useState } from 'react';
import { useRailwayStore, DMT_DELAY_MS } from '@/store/useRailwayStore';
import { ButtonState, PanelButton, RouteInterlockingState, Signal, Switch, RouteZoneCondition, ZoneRole, Zone, ReflexionType, ReflexionDevice } from '@/types/railway';
import { findRoute, RouteResult } from '@/lib/pathfinding';
import { CanFormResult } from '@/lib/interlocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const NOOP = () => {};
const BTN_SIZE = 50; // px — taille fixe des boutons (ne grossit pas quand on élargit la sidebar)
const ACTIVATION_DELAY = 2500; // ms — temps de clignotement avant activation
const BLINK_INTERVAL   =  500; // ms — période de clignotement (rapide)

// Colors for ROUTE buttons
const ROUTE_COLORS: Record<ButtonState, { bg: string; border: string; text: string }> = {
  idle:           { bg: '#1e293b', border: '#334155',  text: '#64748b' },
  forming:        { bg: '#422006', border: '#d97706',  text: '#fcd34d' },
  active:         { bg: '#1a3a1a', border: '#16a34a',  text: '#4ade80' },
  conflict:       { bg: '#450a0a', border: '#dc2626',  text: '#fca5a5' },
  registered:     { bg: '#1a1500', border: '#ca8a04',  text: '#fbbf24' }, // amber — enregistrement
  overregistered: { bg: '#001a1a', border: '#0891b2',  text: '#67e8f9' }, // cyan  — surenregistrement
};

// Colors for FC buttons
const FC_COLORS: Record<ButtonState, { bg: string; border: string; text: string }> = {
  idle:           { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
  forming:        { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
  active:         { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  conflict:       { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  registered:     { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
  overregistered: { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
};

// Colors for ANNULATEUR buttons
const ANN_COLORS: Record<ButtonState, { bg: string; border: string; text: string }> = {
  idle:           { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
  forming:        { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
  active:         { bg: '#422006', border: '#f59e0b', text: '#fcd34d' },
  conflict:       { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  registered:     { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
  overregistered: { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
};

// Colors for reflexion devices
const REFLEXION_COLORS: Record<ReflexionType, string> = {
  DA:  '#dc2626', // rouge
  DSA: '#3b82f6', // bleu
  DR:  '#fbbf24', // jaune
};

const REFLEXION_CYCLE: (ReflexionType | null)[] = [null, 'DA', 'DSA', 'DR'];

// ─── Annulateur config panel ──────────────────────────────────────────────────

function AnnulateurConfig({ btn, onClose }: { btn: PanelButton; onClose: () => void }) {
  const zones             = useRailwayStore(s => s.zones);
  const updatePanelButton = useRailwayStore(s => s.updatePanelButton);

  const [label, setLabel]   = useState(btn.label);
  const [zoneIds, setZoneIds] = useState<string[]>(btn.annulateurZoneIds ?? []);

  const toggleZone = (zId: string) =>
    setZoneIds(prev => prev.includes(zId) ? prev.filter(id => id !== zId) : [...prev, zId]);

  const save = () => {
    updatePanelButton(btn.id, { label, annulateurZoneIds: zoneIds });
    onClose();
  };

  return (
    <div style={cfg.panel}>
      <div style={cfg.header}>
        <span style={{ ...cfg.title, color: '#f59e0b' }}>Annulateur</span>
        <button onClick={onClose} style={cfg.closeBtn}>✕</button>
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Libellé</label>
        <input value={label} onChange={e => setLabel(e.target.value)} style={cfg.input} />
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Zones CDV annulées</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
          {zones.length === 0 && (
            <span style={cfg.meta}>Aucune zone CDV définie.</span>
          )}
          {zones.map(z => {
            const selected = zoneIds.includes(z.id);
            return (
              <button
                key={z.id}
                onClick={() => toggleZone(z.id)}
                style={{
                  textAlign: 'left', padding: '3px 7px', borderRadius: 3,
                  fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
                  background: selected ? '#422006' : '#0f172a',
                  border:     `1px solid ${selected ? '#f59e0b' : '#1e293b'}`,
                  color:      selected ? '#fcd34d' : '#475569',
                }}
              >
                {selected ? '✓ ' : '○ '}{z.label}
              </button>
            );
          })}
        </div>
        {zoneIds.length > 0 && (
          <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 4 }}>
            {zoneIds.length} zone(s) sélectionnée(s)
          </div>
        )}
      </div>

      <button onClick={save} style={cfg.saveBtn}>Enregistrer</button>
    </div>
  );
}

// ─── Route button config panel ────────────────────────────────────────────────

function RouteConfig({ btn, onClose }: { btn: PanelButton; onClose: () => void }) {
  const zones        = useRailwayStore(s => s.zones);
  const edges        = useRailwayStore(s => s.edges);
  const nodes        = useRailwayStore(s => s.nodes);
  const signals      = useRailwayStore(s => s.signals);
  const switches     = useRailwayStore(s => s.switches);
  const routes       = useRailwayStore(s => s.routes);
  const addRoute     = useRailwayStore(s => s.addRoute);
  const updateRoute  = useRailwayStore(s => s.updateRoute);
  const updatePanelButton = useRailwayStore(s => s.updatePanelButton);

  const existingRoute = btn.routeId ? routes[btn.routeId] : null;

  const [label,      setLabel]      = useState(btn.label);
  const [fromZoneId, setFromZoneId] = useState(existingRoute?.fromZoneId ?? '');
  const [toZoneId,   setToZoneId]   = useState(existingRoute?.toZoneId   ?? '');
  const [computed,   setComputed]   = useState<RouteResult | null>(
    existingRoute ? { edgeIds: existingRoute.edgeIds, switchPositions: existingRoute.switchPositions } : null
  );
  const [signalIds,  setSignalIds]  = useState<string[]>(existingRoute?.signalIds ?? []);
  const [error,      setError]      = useState<string | null>(null);
  const [zoneConditions, setZoneConditions] = useState<RouteZoneCondition[]>(
    existingRoute?.zoneConditions ?? []
  );
  const [routeType, setRouteType] = useState<'DA' | 'TP'>(existingRoute?.routeType ?? 'DA');

  function zoneLabel(zoneId: string) {
    const z = zones.find(z => z.id === zoneId);
    if (!z) return zoneId;
    const firstEdge = edges.find(e => z.edgeIds.includes(e.id));
    if (!firstEdge) return z.label;
    const fn = nodes.find(n => n.id === firstEdge.fromNodeId)?.label ?? '?';
    const tn = nodes.find(n => n.id === firstEdge.toNodeId)?.label   ?? '?';
    return `${z.label} (${fn}–${tn})`;
  }

  function nodeName(nodeId: string) {
    return nodes.find(n => n.id === nodeId)?.label ?? '?';
  }

  function handleCompute() {
    const fromZone = zones.find(z => z.id === fromZoneId);
    const toZone   = zones.find(z => z.id === toZoneId);
    if (!fromZone || !toZone) { setError('Sélectionnez une zone origine et une zone terminus.'); return; }
    const result = findRoute(fromZone, toZone, edges, nodes, switches);
    if (!result) { setError('Aucun chemin trouvé entre ces deux zones.'); setComputed(null); return; }
    setComputed(result);
    setError(null);
    setZoneConditions([]);
    const relevantIds = new Set(signals.filter(s => result.edgeIds.includes(s.edgeId)).map(s => s.id));
    setSignalIds(prev => prev.filter(id => relevantIds.has(id)));
  }

  function toggleRole(zoneId: string, role: ZoneRole) {
    setZoneConditions(prev => {
      const existing = prev.find(c => c.zoneId === zoneId);
      if (!existing) {
        const transitCount = prev.filter(c => c.roles.includes('transit')).length;
        return [...prev, { zoneId, roles: [role], ...(role === 'transit' ? { transitIndex: transitCount + 1 } : {}) }];
      }
      const hasRole = existing.roles.includes(role);
      const newRoles = hasRole
        ? existing.roles.filter(r => r !== role)
        : [...existing.roles, role];
      if (newRoles.length === 0) return prev.filter(c => c.zoneId !== zoneId);
      const updated: RouteZoneCondition = { ...existing, roles: newRoles };
      if (!hasRole && role === 'transit') {
        updated.transitIndex = prev.filter(c => c.roles.includes('transit')).length + 1;
      }
      return prev.map(c => c.zoneId === zoneId ? updated : c);
    });
  }

  const relevantSignals = computed
    ? signals.filter(s => computed.edgeIds.includes(s.edgeId))
    : [];

  function handleSave() {
    if (!computed) return;

    // Auto-sort transit zones by their position along the route
    const transitConds = zoneConditions.filter(c => c.roles.includes('transit'));
    const sortedByRoute = [...transitConds].sort((a, b) => {
      const zA = zones.find(z => z.id === a.zoneId);
      const zB = zones.find(z => z.id === b.zoneId);
      const idxA = computed.edgeIds.findIndex(eid => zA?.edgeIds.includes(eid));
      const idxB = computed.edgeIds.findIndex(eid => zB?.edgeIds.includes(eid));
      return idxA - idxB;
    });
    const finalConditions = zoneConditions.map(c => {
      if (!c.roles.includes('transit')) return c;
      const ti = sortedByRoute.findIndex(t => t.zoneId === c.zoneId) + 1;
      return { ...c, transitIndex: ti };
    });

    const routeDef = {
      fromZoneId, toZoneId,
      edgeIds: computed.edgeIds,
      switchPositions: computed.switchPositions,
      signalIds,
      zoneConditions: finalConditions,
      routeType,
    };
    let routeId = btn.routeId;
    if (routeId && routes[routeId]) {
      updateRoute(routeId, routeDef);
    } else {
      routeId = addRoute(routeDef);
    }
    updatePanelButton(btn.id, { label: label.trim() || btn.label, routeId });
    onClose();
  }

  const canCompute = !!fromZoneId && !!toZoneId && fromZoneId !== toZoneId;

  return (
    <div style={cfg.panel}>
      <div style={cfg.header}>
        <span style={cfg.title}>Itinéraire</span>
        <button onClick={onClose} style={cfg.closeBtn}>✕</button>
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Libellé</label>
        <input value={label} onChange={e => setLabel(e.target.value)} style={cfg.input} />
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Type d'itinéraire</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['DA', 'TP'] as const).map(t => (
            <button
              key={t}
              onClick={() => setRouteType(t)}
              style={{
                flex: 1, padding: '4px 0', fontSize: 11, fontFamily: 'monospace',
                fontWeight: 700, cursor: 'pointer', borderRadius: 3,
                background: routeType === t ? (t === 'DA' ? '#1e3a5f' : '#1e3a2f') : '#0f172a',
                border: `1px solid ${routeType === t ? (t === 'DA' ? '#4a90d9' : '#4ade80') : '#334155'}`,
                color: routeType === t ? (t === 'DA' ? '#4a90d9' : '#4ade80') : '#475569',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 8, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
          {routeType === 'DA' ? 'DA — destruction automatique en fin de parcours' : 'TP — tracé permanent maintenu, signal se rouvre automatiquement'}
        </div>
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Zone origine</label>
        <select value={fromZoneId} onChange={e => { setFromZoneId(e.target.value); setComputed(null); setError(null); }} style={cfg.input}>
          <option value="">— choisir —</option>
          {zones.map(z => <option key={z.id} value={z.id} disabled={z.id === toZoneId}>{zoneLabel(z.id)}</option>)}
        </select>
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Zone terminus</label>
        <select value={toZoneId} onChange={e => { setToZoneId(e.target.value); setComputed(null); setError(null); }} style={cfg.input}>
          <option value="">— choisir —</option>
          {zones.map(z => <option key={z.id} value={z.id} disabled={z.id === fromZoneId}>{zoneLabel(z.id)}</option>)}
        </select>
      </div>

      {zones.length === 0 && <span style={cfg.meta}>Aucune zone CDV — dessinez d'abord des tronçons.</span>}

      <button
        onClick={handleCompute}
        disabled={!canCompute}
        style={{ ...cfg.computeBtn, opacity: canCompute ? 1 : 0.45 }}
      >
        Calculer l'itinéraire
      </button>

      {error && <div style={cfg.errorMsg}>{error}</div>}

      {computed && (
        <>
          <div style={cfg.field}>
            <label style={cfg.lbl}>Tronçons ({computed.edgeIds.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {computed.edgeIds.map(eid => {
                const e = edges.find(e => e.id === eid);
                return e ? (
                  <div key={eid} style={cfg.resultRow}>
                    {nodeName(e.fromNodeId)} → {nodeName(e.toNodeId)}
                  </div>
                ) : null;
              })}
            </div>
          </div>

          {Object.keys(computed.switchPositions).length > 0 && (
            <div style={cfg.field}>
              <label style={cfg.lbl}>Aiguilles</label>
              {Object.entries(computed.switchPositions).map(([swId, pos]) => {
                const sw = switches.find(s => s.id === swId);
                return (
                  <div key={swId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={cfg.resultRow}>{sw?.name ?? swId}</span>
                    <span style={{ fontSize: 9, fontFamily: 'monospace', color: pos === 'straight' ? '#4ade80' : '#fcd34d' }}>
                      {pos === 'straight' ? 'Directe' : 'Déviée'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {relevantSignals.length > 0 && (
            <div style={cfg.field}>
              <label style={cfg.lbl}>Signaux à ouvrir</label>
              <div style={cfg.checkList}>
                {relevantSignals.map(sig => (
                  <label key={sig.id} style={cfg.checkRow}>
                    <input type="checkbox" checked={signalIds.includes(sig.id)}
                      onChange={() => setSignalIds(prev => prev.includes(sig.id) ? prev.filter(s => s !== sig.id) : [...prev, sig.id])}
                      style={{ accentColor: '#4a90d9' }} />
                    <span style={cfg.checkLabel}>{sig.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Zone conditions section */}
          {(() => {
            const routeZoneMap = new Map<string, Zone>();
            for (const eid of computed.edgeIds) {
              const z = zones.find(zn => zn.edgeIds.includes(eid));
              if (z && !routeZoneMap.has(z.id)) routeZoneMap.set(z.id, z);
            }
            const routeZones = Array.from(routeZoneMap.values());

            const ROLES: ZoneRole[] = ['ZP', 'ZEA', 'approche', 'transit'];
            const ROLE_LABELS: Record<string, string> = { ZP: 'ZP', ZEA: 'ZEA', approche: 'App.', transit: 'Tr.' };
            const ROLE_COLORS: Record<string, { active: string; inactive: string }> = {
              ZP:      { active: '#ef4444', inactive: '#1e293b' },
              ZEA:     { active: '#f97316', inactive: '#1e293b' },
              approche:{ active: '#8b5cf6', inactive: '#1e293b' },
              transit: { active: '#14b8a6', inactive: '#1e293b' },
            };

            if (routeZones.length === 0) return null;

            return (
              <div style={cfg.field}>
                <label style={cfg.lbl}>Rôles des zones (enclenchements)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {routeZones.map(zone => {
                    const cond = zoneConditions.find(c => c.zoneId === zone.id);
                    const activeRoles = cond?.roles ?? [];
                    const ti = cond?.transitIndex;
                    return (
                      <div key={zone.id} style={{ background: '#0f1e30', border: '1px solid #1e3a5f', borderRadius: 3, padding: '4px 5px' }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {zone.label}
                          {ti !== undefined && <span style={{ color: '#14b8a6', marginLeft: 4 }}>#{ti}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {ROLES.map(role => {
                            const isActive = activeRoles.includes(role);
                            const rc = ROLE_COLORS[role];
                            return (
                              <button
                                key={role}
                                onClick={() => toggleRole(zone.id, role)}
                                style={{
                                  fontSize: 8, fontFamily: 'monospace', padding: '1px 5px',
                                  borderRadius: 2, cursor: 'pointer',
                                  background: isActive ? rc.active + '33' : rc.inactive,
                                  border: `1px solid ${isActive ? rc.active : '#334155'}`,
                                  color: isActive ? rc.active : '#475569',
                                  fontWeight: isActive ? 700 : 400,
                                }}
                              >
                                {ROLE_LABELS[role]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 8, color: '#334155', fontFamily: 'monospace', marginTop: 3 }}>
                  ZP = protection · ZEA = espacement · App. = approche · Tr. = transit
                </div>
              </div>
            );
          })()}
        </>
      )}

      <button onClick={handleSave} disabled={!computed} style={{ ...cfg.saveBtn, opacity: computed ? 1 : 0.4 }}>
        Enregistrer
      </button>
    </div>
  );
}

// ─── FC button config panel ───────────────────────────────────────────────────

function FCConfig({ btn, onClose }: { btn: PanelButton; onClose: () => void }) {
  const signals   = useRailwayStore(s => s.signals);
  const edges     = useRailwayStore(s => s.edges);
  const nodes     = useRailwayStore(s => s.nodes);
  const updatePanelButton = useRailwayStore(s => s.updatePanelButton);

  const [label,      setLabel]      = useState(btn.label);
  const [fcSignalId, setFcSignalId] = useState(btn.fcSignalId ?? '');

  function sigLabel(sig: Signal) {
    const edge = edges.find(e => e.id === sig.edgeId);
    const fn = nodes.find(n => n.id === edge?.fromNodeId)?.label ?? '?';
    const tn = nodes.find(n => n.id === edge?.toNodeId)?.label   ?? '?';
    return `${sig.label} (${fn}→${tn}) ${sig.direction === 'AtoB' ? '→' : '←'}`;
  }

  function handleSave() {
    updatePanelButton(btn.id, { label: label.trim() || btn.label, fcSignalId: fcSignalId || null });
    onClose();
  }

  return (
    <div style={cfg.panel}>
      <div style={cfg.header}>
        <span style={{ ...cfg.title, color: '#a855f7' }}>Fermeture Contrôle</span>
        <button onClick={onClose} style={cfg.closeBtn}>✕</button>
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Libellé</label>
        <input value={label} onChange={e => setLabel(e.target.value)} style={cfg.input} />
      </div>

      <div style={cfg.field}>
        <label style={cfg.lbl}>Signal à bloquer</label>
        <select value={fcSignalId} onChange={e => setFcSignalId(e.target.value)} style={cfg.input}>
          <option value="">— choisir —</option>
          {signals.map(sig => (
            <option key={sig.id} value={sig.id}>{sigLabel(sig)}</option>
          ))}
        </select>
        {signals.length === 0 && <span style={cfg.meta}>Aucun signal défini.</span>}
      </div>

      <p style={cfg.meta}>
        Quand actif (rouge), ce bouton empêche l'ouverture du signal même si un itinéraire le traverse.
      </p>

      <button onClick={handleSave} style={cfg.saveBtn}>Enregistrer</button>
    </div>
  );
}

// ─── Conflict reason helpers ──────────────────────────────────────────────────

/** One-line abbreviation for inside the button. */
function conflictAbbrev(result: CanFormResult): string {
  const { cia, zp, zea, switchConflict, edgeConflict } = result.blocking;
  const parts: string[] = [];
  if (!cia.ok)            parts.push('CIA');
  if (!zp.ok)             parts.push('ZP');
  if (!zea.ok)            parts.push('ZEA');
  if (!switchConflict.ok) parts.push('Aig.');
  if (edgeConflict)       parts.push('Itin.');
  return parts.join(' · ');
}

/** Full human-readable list for the info panel below the grid. */
function conflictReasons(result: CanFormResult, switches: Switch[]): string[] {
  const reasons: string[] = [];
  const { cia, zp, zea, switchConflict, edgeConflict } = result.blocking;

  if (!cia.ok) {
    const names = cia.failingSwitchIds
      .map(id => switches.find(s => s.id === id)?.name ?? id)
      .join(', ');
    reasons.push(`CIA actif — aiguille(s) hors position : ${names}`);
  }
  if (!zp.ok) {
    reasons.push(`ZP occupée (${zp.occupiedZoneIds.length} zone${zp.occupiedZoneIds.length > 1 ? 's' : ''})`);
  }
  if (!zea.ok) {
    reasons.push(`ZEA occupée (${zea.occupiedZoneIds.length} zone${zea.occupiedZoneIds.length > 1 ? 's' : ''})`);
  }
  if (!switchConflict.ok) {
    const names = switchConflict.conflictingSwitchIds
      .map(id => switches.find(s => s.id === id)?.name ?? id)
      .join(', ');
    reasons.push(`Aiguille(s) verrouillée(s) en mauvaise position : ${names}`);
  }
  if (edgeConflict) {
    reasons.push('Itinéraire incompatible — tronçon déjà actif');
  }
  return reasons;
}

// ─── Single pupitre button ────────────────────────────────────────────────────

function PupBtn({
  btn, blinkPhase, conflictDetail, editMode, dmtExpired,
  configHint, onPress, onConfig, onReflexionClick,
}: {
  btn: PanelButton;
  blinkPhase: boolean;
  conflictDetail?: CanFormResult;
  editMode: boolean;
  dmtExpired?: boolean;
  configHint?: string;
  onPress: () => void;
  onConfig: () => void;
  onReflexionClick: (slot: number) => void;
}) {
  const isFC  = btn.type === 'fc';
  const isAnn = btn.type === 'annulateur';
  const colors = isAnn ? ANN_COLORS[btn.state] : isFC ? FC_COLORS[btn.state] : ROUTE_COLORS[btn.state];
  const isForming    = btn.state === 'forming' || btn.state === 'registered' || btn.state === 'overregistered';
  const isDmtExpired = !!dmtExpired;
  const configured = isAnn
    ? btn.annulateurZoneIds.length > 0
    : isFC ? !!btn.fcSignalId : !!btn.routeId;

  // LED blinks during forming/registered/overregistered OR when DMT delay has expired
  const isBlink = isForming || isDmtExpired;
  const ledOn = !isBlink || blinkPhase;

  const STATE_TAG: Partial<Record<ButtonState, string>> = {
    forming:        'FORM.',
    active:         isDmtExpired ? '2E GESTE' : 'ACTIF',
    conflict:       'CONF.',
    registered:     'ENREG.',
    overregistered: 'SURENR.',
  };
  const stateTag = STATE_TAG[btn.state] ?? '';

  const reflexions = btn.reflexions ?? [];

  function ReflexionRow({ slots }: { slots: number[] }) {
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0,
        display: 'flex', justifyContent: 'space-around',
        padding: '0 5px', zIndex: 4, pointerEvents: 'none',
        ...(slots[0] < 3 ? { top: 3 } : { bottom: 3 }),
      }}>
        {slots.map(slot => {
          const device = reflexions.find(r => r.slot === slot);
          const color = device ? REFLEXION_COLORS[device.type] : null;
          return (
            <div
              key={slot}
              title={device ? device.type : `Slot ${slot + 1}`}
              onClick={e => { e.stopPropagation(); onReflexionClick(slot); }}
              style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: color ?? '#0f172a',
                border: `1px solid ${color ?? '#334155'}`,
                boxShadow: color ? `0 0 4px 1px ${color}88` : 'none',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Gear icon — only in editMode */}
      {editMode && (
        <button
          onClick={e => { e.stopPropagation(); onConfig(); }}
          title="Paramétrer"
          style={{
            position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
            background: 'transparent', border: 'none',
            color: configured ? '#475569' : '#b45309',
            cursor: 'pointer', fontSize: 8, padding: '1px 2px', lineHeight: 1,
          }}
        >⚙</button>
      )}

      {/* Config hint — shown below button in edit mode */}
      {editMode && configHint && (
        <div style={{
          position: 'absolute', bottom: -14, left: 0, right: 0,
          fontSize: 7, fontFamily: 'monospace', textAlign: 'center',
          color: configured ? '#475569' : '#b45309',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 3,
        }}>
          {configHint}
        </div>
      )}

      {isFC ? (
        /* ── FC rotary knob ─────────────────────────────────────────────── */
        <button
          onClick={onPress}
          style={{
            width: BTN_SIZE, height: BTN_SIZE, flexShrink: 0,
            background: 'transparent',
            border: editMode && !configured ? '1px dashed #b45309' : 'none',
            borderRadius: 5,
            cursor: configured ? 'pointer' : 'default',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '2px', gap: 1,
          }}
          title={configured ? `FC ${btn.label}` : 'Non configuré — FC'}
        >
          <span style={{
            fontSize: 8, fontWeight: 700, fontFamily: 'monospace',
            color: configured ? '#e2e8f0' : '#1e3a5f',
            letterSpacing: 0.5, textAlign: 'center', lineHeight: 1,
            maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{btn.label}</span>
          <svg width={34} height={34} viewBox="-22 -22 44 44" style={{ display: 'block', flexShrink: 0 }}>
            {/* Bezel */}
            <circle cx={0} cy={0} r={21} fill="#0d0a1a" stroke={configured ? '#4a1d96' : '#1e1b2e'} strokeWidth={1.5} />
            {/* Disk */}
            <circle cx={0} cy={0} r={17}
              fill={btn.state === 'active' ? '#b91c1c' : (configured ? '#450a0a' : '#1a0a1a')}
              stroke={btn.state === 'active' ? '#ef4444' : '#7c3aed'}
              strokeWidth={1}
            />
            {/* Indicator bar — 0° = up (active), 180° = down (inactive) */}
            <g transform={`rotate(${btn.state === 'active' ? 0 : 180})`} style={{ transition: 'transform 0.2s' }}>
              <rect x={-3} y={-14} width={6} height={11} rx={3}
                fill="white" opacity={configured ? 1 : 0.2}
              />
            </g>
            {/* Centre pin */}
            <circle cx={0} cy={0} r={2.5} fill="#1a0a1a" stroke="white" strokeWidth={0.8} opacity={configured ? 0.6 : 0.2} />
          </svg>
        </button>
      ) : (
        /* ── Standard / ANN button ──────────────────────────────────────── */
        <button
          onClick={onPress}
          style={{
            width: BTN_SIZE, height: BTN_SIZE, flexShrink: 0,
            background: colors.bg,
            border: editMode && !configured
              ? '1px dashed #b45309'
              : `2px solid ${isBlink && !blinkPhase ? (isDmtExpired ? '#78350f' : '#3d2000') : colors.border}`,
            borderRadius: 5,
            cursor: configured ? 'pointer' : 'default',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            padding: '4px 2px',
            transition: isBlink ? 'border-color 0.1s' : 'opacity 0.15s',
            position: 'relative',
            overflow: 'hidden',
          }}
          title={configured ? `${btn.label}` : 'Non configuré'}
        >
          {/* ANN badge */}
          {isAnn && (
            <span style={{
              position: 'absolute', top: 2, left: 3,
              fontSize: 6, fontFamily: 'monospace', color: '#f59e0b', lineHeight: 1,
            }}>ANN</span>
          )}

          {/* LED */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: ledOn && configured
              ? colors.border
              : (isForming ? '#3d2000' : '#0f172a'),
            boxShadow: ledOn && btn.state !== 'idle' && configured
              ? `0 0 5px 1px ${colors.border}`
              : 'none',
          }} />

          {/* Label */}
          <span style={{
            fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
            color: configured ? colors.text : '#1e3a5f',
            letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.1,
            maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {btn.label}
          </span>

          {/* State tag */}
          {stateTag && (
            <span style={{
              fontSize: 7, fontFamily: 'monospace',
              color: colors.text, opacity: 0.65, letterSpacing: 0.4,
            }}>
              {stateTag}
            </span>
          )}

          {/* Conflict reason */}
          {btn.state === 'conflict' && conflictDetail && (
            <span style={{
              fontSize: 6, fontFamily: 'monospace', color: '#fca5a5',
              letterSpacing: 0.2, textAlign: 'center', lineHeight: 1.1,
              maxWidth: '95%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {conflictAbbrev(conflictDetail)}
            </span>
          )}
        </button>
      )}

      {/* ── Dispositifs de réflexion — pas sur les FC ── */}
      {!isFC && <ReflexionRow slots={[0, 1, 2]} />}
      {!isFC && <ReflexionRow slots={[3, 4, 5]} />}
    </div>
  );
}

// ─── DMT status panel ─────────────────────────────────────────────────────────

function DmtPanel({ entries }: {
  entries: Array<{ label: string; ris: RouteInterlockingState; fcActive: boolean }>;
}) {
  // Force a re-render every second so the countdown stays live
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) return null;

  return (
    <>
      <div style={p.divider} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(({ label, ris, fcActive }) => {
          const started   = ris.DM_startTime !== null;
          const elapsed   = started ? Date.now() - ris.DM_startTime! : 0;
          const remaining = Math.max(0, DMT_DELAY_MS - elapsed);
          const expired   = started && remaining === 0;
          const mm = Math.floor(remaining / 60_000);
          const ss = Math.floor((remaining % 60_000) / 1000);
          const timeStr = `${mm}:${String(ss).padStart(2, '0')}`;

          return (
            <div key={label} style={{
              background: '#0f1a2b', border: `1px solid ${expired ? '#d97706' : '#b45309'}`,
              borderRadius: 4, padding: '6px 8px',
            }}>
              {/* Header */}
              <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                            color: '#fcd34d', letterSpacing: 0.5, marginBottom: 6 }}>
                {label} — DMT
              </div>

              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                {([
                  { key: 'FC',        active: !fcActive && !started, done: fcActive || started },
                  { key: '1er geste', active: fcActive && !started,  done: started  },
                  { key: 'Délai',     active: started && !expired,    done: expired  },
                  { key: '2e geste',  active: expired,                done: false    },
                ] as const).map(({ key, active, done }) => (
                  <div key={key} style={{
                    flex: 1, textAlign: 'center', fontSize: 7, fontFamily: 'monospace',
                    padding: '2px 0', borderRadius: 2,
                    background: active ? '#7c2d12' : done ? '#1a3a1a' : '#0f172a',
                    color:      active ? '#fb923c' : done ? '#4ade80' : '#334155',
                    border:    `1px solid ${active ? '#ea580c' : done ? '#16a34a' : '#1e293b'}`,
                  }}>{key}</div>
                ))}
              </div>

              {/* Stage content */}

              {/* ── FC manquante ── */}
              {!fcActive && !started && (
                <>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#f59e0b', lineHeight: 1.7 }}>
                    · E.Ap actif — signal maintenu ouvert<br />
                    · Destruction normale bloquée
                  </div>
                  <div style={{ marginTop: 5, padding: '4px 6px',
                                background: '#1a001a', borderRadius: 3,
                                border: '1px solid #7c3aed' }}>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#a78bfa',
                                  fontWeight: 700, marginBottom: 2 }}>
                      FC REQUISE EN PREMIER
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#6d28d9', lineHeight: 1.5 }}>
                      Poser la FC (Fermeture de Contrôle) sur le signal<br />
                      avant d'engager la procédure de destruction.<br />
                      Le bouton d'itinéraire est inopérant sans FC.
                    </div>
                  </div>
                </>
              )}

              {/* ── FC posée, attente 1er geste ── */}
              {fcActive && !started && (
                <>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#f59e0b', lineHeight: 1.7 }}>
                    · FC posée — signal fermé<br />
                    · E.Ap actif — destruction bloquée
                  </div>
                  <div style={{ marginTop: 5, padding: '4px 6px',
                                background: '#1c0f00', borderRadius: 3,
                                border: '1px solid #92400e' }}>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#fb923c',
                                  fontWeight: 700, marginBottom: 2 }}>
                      1ER GESTE — Demande de destruction
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#a16207', lineHeight: 1.5 }}>
                      Cliquer sur le bouton d'itinéraire pour démarrer<br />
                      le délai réglementaire (constatation d'arrêt).
                    </div>
                  </div>
                </>
              )}

              {started && !expired && (
                <>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#fbbf24', lineHeight: 1.7 }}>
                    · 1er geste effectué<br />
                    · 2e geste bloqué jusqu'à expiration du délai
                  </div>
                  <div style={{
                    fontSize: 22, fontFamily: 'monospace', fontWeight: 700,
                    color: '#f59e0b', textAlign: 'center', margin: '6px 0 2px',
                    letterSpacing: 3,
                  }}>
                    {timeStr}
                  </div>
                  <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#92400e',
                                textAlign: 'center', letterSpacing: 0.5 }}>
                    DESTRUCTION BLOQUÉE
                  </div>
                </>
              )}

              {expired && (
                <>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#fcd34d', lineHeight: 1.7 }}>
                    · Délai réglementaire expiré
                  </div>
                  <div style={{ marginTop: 5, padding: '4px 6px',
                                background: '#1a1200', borderRadius: 3,
                                border: '1px solid #d97706' }}>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#fcd34d',
                                  fontWeight: 700, marginBottom: 2 }}>
                      2E GESTE — Ann. EAp
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#a16207', lineHeight: 1.6 }}>
                      Cliquer sur le bouton d'itinéraire pour :<br />
                      · Annulation E.Ap<br />
                      · Libération des aiguilles<br />
                      · Destruction de l'itinéraire
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PupitrePanel({ variant = 'sidebar', width }: { variant?: 'sidebar' | 'bottom'; width?: number }) {
  const panelButtons      = useRailwayStore(s => s.panelButtons);
  const blinkPhase        = useRailwayStore(s => s.blinkPhase);
  const toggleBlinkPhase  = useRailwayStore(s => s.toggleBlinkPhase);
  const addPanelButton    = useRailwayStore(s => s.addPanelButton);
  const removePanelButton = useRailwayStore(s => s.removePanelButton);
  const updatePanelButton = useRailwayStore(s => s.updatePanelButton);
  const pressButton       = useRailwayStore(s => s.pressButton);
  const activateButton    = useRailwayStore(s => s.activateButton);
  const conflictDetails          = useRailwayStore(s => s.conflictDetails);
  const switches                 = useRailwayStore(s => s.switches);
  const routes                   = useRailwayStore(s => s.routes);
  const routeInterlockingStates  = useRailwayStore(s => s.routeInterlockingStates);
  const signals                  = useRailwayStore(s => s.signals);
  const zones                    = useRailwayStore(s => s.zones);
  const testZoneActive           = useRailwayStore(s => s.testZoneActive);
  const setTestZoneActive        = useRailwayStore(s => s.setTestZoneActive);
  const testAiguilleActive       = useRailwayStore(s => s.testAiguilleActive);
  const setTestAiguilleActive    = useRailwayStore(s => s.setTestAiguilleActive);

  const [configId, setConfigId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [gridZoom, setGridZoom] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setGridZoom(prev => Math.min(2.5, Math.max(0.4, prev * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function cycleReflexion(btnId: string, slot: number) {
    const btn = panelButtons[btnId];
    if (!btn) return;
    const reflexions: ReflexionDevice[] = btn.reflexions ?? [];
    const existing = reflexions.find(r => r.slot === slot);
    const currentIdx = existing ? REFLEXION_CYCLE.indexOf(existing.type) : 0;
    const nextType = REFLEXION_CYCLE[(currentIdx + 1) % REFLEXION_CYCLE.length];
    const newReflexions: ReflexionDevice[] = nextType === null
      ? reflexions.filter(r => r.slot !== slot)
      : [...reflexions.filter(r => r.slot !== slot), { slot, type: nextType }];
    updatePanelButton(btnId, { reflexions: newReflexions });
  }

  // ── Auto-activate forming route buttons after ACTIVATION_DELAY ─────────────
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const formingIds = new Set(
      Object.values(panelButtons)
        .filter(b => b.state === 'forming' && b.type !== 'fc')
        .map(b => b.id)
    );

    // Cancel timers for buttons no longer forming
    Object.keys(timersRef.current).forEach(id => {
      if (!formingIds.has(id)) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    });

    // Start new timers
    formingIds.forEach(id => {
      if (!timersRef.current[id]) {
        timersRef.current[id] = setTimeout(() => {
          delete timersRef.current[id];
          activateButton(id);
        }, ACTIVATION_DELAY);
      }
    });
  }, [panelButtons, activateButton]);

  // ── Blink timer ────────────────────────────────────────────────────────────
  const hasForming = Object.values(panelButtons).some(
    b => b.state === 'forming' || b.state === 'registered' || b.state === 'overregistered',
  );
  useEffect(() => {
    if (!hasForming) return;
    const interval = setInterval(toggleBlinkPhase, BLINK_INTERVAL);
    return () => clearInterval(interval);
  }, [hasForming, toggleBlinkPhase]);

  const sortedButtons = Object.values(panelButtons)
    .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);

  const configBtn = configId ? panelButtons[configId] : null;

  // ── Config hint text shown on each button in CONFIG mode ─────────────────────
  function configHintFor(btn: typeof sortedButtons[0]): string {
    if (btn.type === 'fc') {
      const sig = signals.find(s => s.id === btn.fcSignalId);
      return sig ? sig.label : '— signal —';
    }
    if (btn.type === 'annulateur') {
      const n = btn.annulateurZoneIds.length;
      return n > 0 ? `${n} zone${n > 1 ? 's' : ''}` : '— zones —';
    }
    const route = btn.routeId ? routes[btn.routeId] : null;
    if (!route) return '— itinéraire —';
    const fromZ = zones.find(z => z.id === route.fromZoneId);
    const toZ   = zones.find(z => z.id === route.toZoneId);
    return fromZ && toZ ? `${fromZ.label}→${toZ.label}` : route.fromZoneId ? '…' : '—';
  }

  // ── Shared: status bar content ──────────────────────────────────────────────
  const statusNode = (() => {
    const counts = {
      active:         sortedButtons.filter(b => b.state === 'active').length,
      forming:        sortedButtons.filter(b => b.state === 'forming').length,
      conflict:       sortedButtons.filter(b => b.state === 'conflict').length,
      registered:     sortedButtons.filter(b => b.state === 'registered').length,
      overregistered: sortedButtons.filter(b => b.state === 'overregistered').length,
    };
    const parts: React.ReactNode[] = [];
    if (counts.active         > 0) parts.push(<span key="a" style={{ color: '#4ade80' }}>{counts.active} actif{counts.active > 1 ? 's' : ''}</span>);
    if (counts.forming        > 0) parts.push(<span key="f" style={{ color: '#fcd34d' }}>{counts.forming} form.</span>);
    if (counts.registered     > 0) parts.push(<span key="r" style={{ color: '#fbbf24' }}>{counts.registered} enreg.</span>);
    if (counts.overregistered > 0) parts.push(<span key="o" style={{ color: '#67e8f9' }}>{counts.overregistered} surenr.</span>);
    if (counts.conflict       > 0) parts.push(<span key="c" style={{ color: '#f87171' }}>{counts.conflict} conf.</span>);
    return parts.length === 0
      ? <span style={{ color: '#1e3a5f' }}>Poste libre</span>
      : parts.reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`s${i}`} style={{ color: '#1e3a5f' }}> · </span>, el], []);
  })();

  // ── Shared: DMT entries ─────────────────────────────────────────────────────
  const dmtEntries = sortedButtons
    .filter(b => b.state === 'active' && b.routeId && routeInterlockingStates[b.routeId]?.EAP_active)
    .map(b => {
      const route = routes[b.routeId!];
      const routeSignalIds = new Set(route?.signalIds ?? []);
      const fcActive = sortedButtons.some(
        fc => fc.type === 'fc' && fc.state === 'active'
           && fc.fcSignalId !== null && routeSignalIds.has(fc.fcSignalId),
      );
      return { label: b.label, ris: routeInterlockingStates[b.routeId!], fcActive };
    });

  // ── Bottom variant ──────────────────────────────────────────────────────────
  if (variant === 'bottom') {
    return (
      <div style={p.bottomPanel}>
        {/* Identity + status */}
        <div style={p.bottomLeft}>
          <div style={{ color: '#4a90d9', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, whiteSpace: 'nowrap' }}>
            PUPITRE PRS
          </div>
          <div style={{ fontSize: 8, fontFamily: 'monospace', marginTop: 4, lineHeight: 1.6 }}>
            {statusNode}
          </div>
        </div>

        <div style={p.bottomDivider} />

        {/* Button grid */}
        <div style={p.bottomCenter}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 58px))', gap: 6, alignContent: 'center' }}>
            {sortedButtons.map(btn => {
              const ris = btn.routeId ? routeInterlockingStates[btn.routeId] : undefined;
              const dmtExpired = ris?.EAP_active && ris.DM_startTime !== null
                && (Date.now() - ris.DM_startTime) >= DMT_DELAY_MS;
              return (
                <PupBtn
                  key={btn.id}
                  btn={btn}
                  blinkPhase={blinkPhase}
                  conflictDetail={conflictDetails[btn.id]}
                  editMode={false}
                  dmtExpired={dmtExpired}
                  onPress={() => pressButton(btn.id)}
                  onConfig={NOOP}
                  onReflexionClick={slot => cycleReflexion(btn.id, slot)}
                />
              );
            })}
          </div>
        </div>

        {/* DMT panel (if active) */}
        {dmtEntries.length > 0 && (
          <>
            <div style={p.bottomDivider} />
            <div style={p.bottomRight}>
              <DmtPanel entries={dmtEntries} />
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Sidebar variant (default) ───────────────────────────────────────────────
  return (
    <aside style={{ ...p.panel, width: width ?? 220 }}>

      {/* ── FIXED TOP: header + status + divider ─────────────────────────── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ margin: 0, color: '#4a90d9', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}>
            Pupitre PRS
          </h3>
          <button
            onClick={() => { setEditMode(v => !v); if (editMode) setConfigId(null); }}
            title={editMode ? 'Passer en mode exploitation' : 'Passer en mode configuration'}
            style={{
              fontSize: 8, fontFamily: 'monospace', letterSpacing: 0.5,
              padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
              background: editMode ? '#0c2a4a' : '#1e293b',
              border: `1px solid ${editMode ? '#3b82f6' : '#334155'}`,
              color: editMode ? '#60a5fa' : '#475569',
            }}
          >
            {editMode ? 'CONFIG.' : 'EXPL.'}
          </button>
        </div>
        <div style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace', marginBottom: 8, minHeight: 14 }}>
          {statusNode}
        </div>
        <div style={p.divider} />
      </div>

      {/* ── SCROLLABLE MIDDLE: button grid + conflict + DMT ──────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 4 }}>

        {/* Button groups — zoomable */}
        <div
          ref={gridRef}
          style={{ overflow: 'hidden' }}
        >
          <div style={{
            transform: `scale(${gridZoom})`, transformOrigin: 'top left',
            width: `${100 / gridZoom}%`,
          }}>
            {(() => {
              const routeBtns = sortedButtons.filter(b => b.type === 'route');
              const fcBtns    = sortedButtons.filter(b => b.type === 'fc');
              const annBtns   = sortedButtons.filter(b => b.type === 'annulateur');
              const gap = editMode ? 18 : 5;

              function BtnGrid({ btns, addLabel, addColor, onAdd }: {
                btns: typeof sortedButtons;
                addLabel?: string;
                addColor?: string;
                onAdd?: () => void;
              }) {
                return (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap',
                    gap, paddingBottom: editMode ? gap : 0,
                  }}>
                    {btns.map(btn => {
                      const ris = btn.routeId ? routeInterlockingStates[btn.routeId] : undefined;
                      const dmtExpired = ris?.EAP_active && ris.DM_startTime !== null
                        && (Date.now() - ris.DM_startTime) >= DMT_DELAY_MS;
                      return (
                        <PupBtn
                          key={btn.id}
                          btn={btn}
                          blinkPhase={blinkPhase}
                          conflictDetail={conflictDetails[btn.id]}
                          editMode={editMode}
                          dmtExpired={dmtExpired}
                          configHint={editMode ? configHintFor(btn) : undefined}
                          onPress={() => pressButton(btn.id)}
                          onConfig={() => setConfigId(configId === btn.id ? null : btn.id)}
                          onReflexionClick={slot => cycleReflexion(btn.id, slot)}
                        />
                      );
                    })}
                    {editMode && addLabel && onAdd && (
                      <button
                        onClick={onAdd}
                        style={{ ...p.addBtn, width: BTN_SIZE, height: BTN_SIZE, borderColor: addColor, color: addColor }}
                        title={`Ajouter ${addLabel}`}
                      >{addLabel}</button>
                    )}
                  </div>
                );
              }

              return (
                <>
                  {/* ── Itinéraires ── */}
                  {(routeBtns.length > 0 || editMode) && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={p.groupHeader}>Itinéraires</div>
                      <BtnGrid
                        btns={routeBtns}
                        addLabel="+"
                        addColor="#334155"
                        onAdd={() => { const id = addPanelButton('route'); setConfigId(id); }}
                      />
                    </div>
                  )}

                  {/* ── FC ── */}
                  {(fcBtns.length > 0 || editMode) && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={p.groupHeader}>Fermetures de contrôle</div>
                      <BtnGrid
                        btns={fcBtns}
                        addLabel="FC"
                        addColor="#581c87"
                        onAdd={() => { const id = addPanelButton('fc'); setConfigId(id); }}
                      />
                    </div>
                  )}

                  {/* ── Annulateurs ── */}
                  {(annBtns.length > 0 || editMode) && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={p.groupHeader}>Annulateurs</div>
                      <BtnGrid
                        btns={annBtns}
                        addLabel="ANN"
                        addColor="#854d0e"
                        onAdd={() => { const id = addPanelButton('annulateur'); setConfigId(id); }}
                      />
                    </div>
                  )}

                  {/* ── Boutons de diagnostic — toujours présents ── */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={p.groupHeader}>Diagnostic</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {/* Test Zone */}
                      <button
                        onPointerDown={() => setTestZoneActive(true)}
                        onPointerUp={() => setTestZoneActive(false)}
                        onPointerLeave={() => setTestZoneActive(false)}
                        title="Test Zone — maintenir enfoncé pour illuminer toutes les zones libres"
                        style={{
                          width: BTN_SIZE, height: BTN_SIZE, flexShrink: 0,
                          background: testZoneActive ? '#422006' : '#1e293b',
                          border: `2px solid ${testZoneActive ? '#f59e0b' : '#334155'}`,
                          borderRadius: 5, cursor: 'pointer',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 2,
                          padding: '4px 2px', userSelect: 'none',
                          boxShadow: testZoneActive ? '0 0 6px 2px #f59e0b44' : 'none',
                          transition: 'background 0.1s, border-color 0.1s, box-shadow 0.1s',
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: testZoneActive ? '#f59e0b' : '#0f172a', boxShadow: testZoneActive ? '0 0 5px 1px #f59e0b' : 'none' }} />
                        <span style={{ fontSize: 7, fontWeight: 700, fontFamily: 'monospace', color: testZoneActive ? '#fcd34d' : '#475569', letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.2, maxWidth: '90%' }}>Test Zone</span>
                      </button>

                      {/* Test Aiguille */}
                      <button
                        onPointerDown={() => setTestAiguilleActive(true)}
                        onPointerUp={() => setTestAiguilleActive(false)}
                        onPointerLeave={() => setTestAiguilleActive(false)}
                        title="Test Aiguille — maintenir enfoncé pour révéler les positions des aiguilles (vue apprenant)"
                        style={{
                          width: BTN_SIZE, height: BTN_SIZE, flexShrink: 0,
                          background: testAiguilleActive ? '#0c2a1a' : '#1e293b',
                          border: `2px solid ${testAiguilleActive ? '#22c55e' : '#334155'}`,
                          borderRadius: 5, cursor: 'pointer',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', gap: 2,
                          padding: '4px 2px', userSelect: 'none',
                          boxShadow: testAiguilleActive ? '0 0 6px 2px #22c55e44' : 'none',
                          transition: 'background 0.1s, border-color 0.1s, box-shadow 0.1s',
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: testAiguilleActive ? '#22c55e' : '#0f172a', boxShadow: testAiguilleActive ? '0 0 5px 1px #22c55e' : 'none' }} />
                        <span style={{ fontSize: 7, fontWeight: 700, fontFamily: 'monospace', color: testAiguilleActive ? '#4ade80' : '#475569', letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.2, maxWidth: '90%' }}>Test Aiguille</span>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>{/* end zoom wrapper */}

        {/* Conflict detail panel */}
        {(() => {
          const conflicting = sortedButtons.filter(b => b.state === 'conflict' && conflictDetails[b.id]);
          if (conflicting.length === 0) return null;
          return (
            <>
              <div style={p.divider} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conflicting.map(btn => {
                  const detail = conflictDetails[btn.id]!;
                  const reasons = conflictReasons(detail, switches);
                  return (
                    <div key={btn.id} style={{
                      background: '#1a0505', border: '1px solid #7f1d1d',
                      borderRadius: 4, padding: '6px 8px',
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                                    color: '#fca5a5', marginBottom: 4, letterSpacing: 0.5 }}>
                        {btn.label} — Conflit
                      </div>
                      {reasons.map((r, i) => (
                        <div key={i} style={{ fontSize: 9, fontFamily: 'monospace',
                                              color: '#ef4444', lineHeight: 1.5 }}>
                          · {r}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* DMT status panel */}
        <DmtPanel entries={dmtEntries} />

      </div>{/* end scrollable middle */}

      {/* ── FIXED BOTTOM: config panel ───────────────────────────────────── */}
      {configBtn && editMode && (
        <div style={{
          flexShrink: 0, borderTop: '1px solid #1e3a5f',
          maxHeight: '55vh', overflowY: 'auto',
          paddingTop: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', fontWeight: 700 }}>
              {configBtn.label}
            </span>
            <button
              onClick={() => { removePanelButton(configBtn.id); setConfigId(null); }}
              style={{ background: 'transparent', border: 'none', color: '#7f1d1d', cursor: 'pointer', fontSize: 10 }}
            >Supprimer</button>
          </div>

          {configBtn.type === 'fc'
            ? <FCConfig btn={configBtn} onClose={() => setConfigId(null)} />
            : configBtn.type === 'annulateur'
            ? <AnnulateurConfig btn={configBtn} onClose={() => setConfigId(null)} />
            : <RouteConfig btn={configBtn} onClose={() => setConfigId(null)} />
          }
        </div>
      )}
    </aside>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const p: Record<string, React.CSSProperties> = {
  panel:   { width: '100%', flexShrink: 0, padding: 12, background: '#080e1a',
             borderRight: '1px solid #1e3a5f', overflowY: 'hidden',
             display: 'flex', flexDirection: 'column',
             fontFamily: 'system-ui, sans-serif' },
  title:   { margin: 0, color: '#4a90d9', fontSize: 12, fontWeight: 700,
             letterSpacing: 1, textTransform: 'uppercase' as const },
  divider: { height: 1, background: '#1e3a5f', margin: '10px 0' },
  addBtn:  { width: BTN_SIZE, height: BTN_SIZE, flexShrink: 0,
             background: 'transparent', border: '1px dashed #1e3a5f',
             borderRadius: 4, color: '#334155', cursor: 'pointer', fontSize: 12,
             display: 'flex', alignItems: 'center', justifyContent: 'center' },
  groupHeader: { fontSize: 8, fontFamily: 'monospace', letterSpacing: 1,
                 textTransform: 'uppercase' as const, color: '#334155',
                 marginBottom: 5, paddingLeft: 1 },
  // Bottom variant
  bottomPanel: {
    display: 'flex', flexDirection: 'row', alignItems: 'stretch',
    width: '100%', height: '100%',
    background: '#080e1a',
    fontFamily: 'system-ui, sans-serif', overflow: 'hidden',
  },
  bottomLeft: {
    width: 110, flexShrink: 0, padding: '10px 12px',
    borderRight: '1px solid #1e3a5f', display: 'flex',
    flexDirection: 'column', justifyContent: 'flex-start',
  },
  bottomDivider: {
    width: 1, flexShrink: 0, background: '#1e3a5f', margin: '8px 0',
  },
  bottomCenter: {
    flex: 1, padding: '8px 10px', overflowX: 'auto', overflowY: 'hidden',
    display: 'flex', alignItems: 'center',
  },
  bottomRight: {
    width: 200, flexShrink: 0, padding: '8px 10px',
    borderLeft: '1px solid #1e3a5f', overflowY: 'auto',
  },
};

const cfg: Record<string, React.CSSProperties> = {
  panel:      { background: '#0a1220', border: '1px solid #1e3a5f', borderRadius: 6, padding: 10 },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title:      { color: '#4a90d9', fontSize: 11, fontWeight: 700, fontFamily: 'monospace' },
  closeBtn:   { background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12 },
  field:      { marginBottom: 8 },
  lbl:        { display: 'block', color: '#64748b', fontSize: 9, textTransform: 'uppercase' as const,
                letterSpacing: 0.5, marginBottom: 3 },
  input:      { width: '100%', padding: '4px 6px', background: '#1e293b', color: 'white',
                border: '1px solid #334155', borderRadius: 3, fontSize: 11,
                fontFamily: 'monospace', boxSizing: 'border-box' as const, outline: 'none' },
  checkList:  { display: 'flex', flexDirection: 'column' as const, gap: 3, maxHeight: 80, overflowY: 'auto' as const },
  checkRow:   { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' },
  checkLabel: { fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' },
  meta:       { fontSize: 9, color: '#475569', fontFamily: 'monospace', margin: '4px 0' },
  errorMsg:   { color: '#fca5a5', fontSize: 9, fontFamily: 'monospace', marginBottom: 6 },
  resultRow:  { fontSize: 9, color: '#64748b', fontFamily: 'monospace' },
  saveBtn:    { width: '100%', padding: '5px 0', background: '#1d4ed8', color: 'white',
                border: '1px solid #3b82f6', borderRadius: 3, cursor: 'pointer', fontSize: 11, marginTop: 4 },
  computeBtn: { width: '100%', padding: '5px 0', background: '#0f4c75', color: 'white',
                border: '1px solid #1e6091', borderRadius: 3, cursor: 'pointer', fontSize: 11, marginBottom: 6 },
};
