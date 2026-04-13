'use client';
import { useRailwayStore } from '@/store/useRailwayStore';
import { ZoneSupervisionPanel } from './ZoneSupervisionPanel';
import { InterlockingSupervisionPanel } from './InterlockingSupervisionPanel';

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={s.deleteBtn}>Supprimer</button>;
}

function Divider() {
  return <div style={{ height: 1, background: '#1e3a5f', margin: '12px 0' }} />;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span style={s.badge}>{children}</span>;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const selection  = useRailwayStore(s => s.selection);
  const mode       = useRailwayStore(s => s.mode);
  const nodes      = useRailwayStore(s => s.nodes);
  const edges      = useRailwayStore(s => s.edges);
  const zones      = useRailwayStore(s => s.zones);
  const signals    = useRailwayStore(s => s.signals);
  const switches   = useRailwayStore(s => s.switches);
  const textLabels = useRailwayStore(s => s.textLabels);

  const toggleZoneOccupied = useRailwayStore(s => s.toggleZoneOccupied);
  const routes             = useRailwayStore(s => s.routes);
  const setZoneDerangement = useRailwayStore(s => s.setZoneDerangement);
  const routeInterlockingStates = useRailwayStore(s => s.routeInterlockingStates);
  const panelButtons            = useRailwayStore(s => s.panelButtons);

  const updateNode       = useRailwayStore(s => s.updateNode);
  const deleteNode       = useRailwayStore(s => s.deleteNode);
  const updateEdge       = useRailwayStore(s => s.updateEdge);
  const deleteEdge       = useRailwayStore(s => s.deleteEdge);
  const updateZone         = useRailwayStore(s => s.updateZone);
  const deleteZone         = useRailwayStore(s => s.deleteZone);
  const assignEdgeToZone   = useRailwayStore(s => s.assignEdgeToZone);
  const removeEdgeFromZone = useRailwayStore(s => s.removeEdgeFromZone);
  const updateSignal          = useRailwayStore(s => s.updateSignal);
  const deleteSignal          = useRailwayStore(s => s.deleteSignal);
  const setRouteApproachZone  = useRailwayStore(s => s.setRouteApproachZone);
  const updateSwitch         = useRailwayStore(s => s.updateSwitch);
  const deleteSwitch         = useRailwayStore(s => s.deleteSwitch);
  const toggleSwitchPosition = useRailwayStore(s => s.toggleSwitchPosition);
  const toggleSwitchLock     = useRailwayStore(s => s.toggleSwitchLock);
  const autoAssignSwitch     = useRailwayStore(s => s.autoAssignSwitch);
  const setSwitchDiscordance = useRailwayStore(s => s.setSwitchDiscordance);
  const updateTextLabel  = useRailwayStore(s => s.updateTextLabel);
  const deleteTextLabel  = useRailwayStore(s => s.deleteTextLabel);
  const addZone          = useRailwayStore(s => s.addZone);

  // ── Node panel ──────────────────────────────────────────────────────────────

  if (selection?.type === 'node') {
    const node = nodes.find(n => n.id === selection.id);
    if (!node) return null;

    return (
      <aside style={s.panel}>
        <h3 style={s.title}>Nœud</h3>
        <Divider />

        <Field label="Nom">
          <input
            value={node.label}
            onChange={e => updateNode(node.id, { label: e.target.value })}
            style={s.input}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Field label="X">
            <input type="number" value={Math.round(node.x)}
              onChange={e => updateNode(node.id, { x: Number(e.target.value) })}
              style={s.input} />
          </Field>
          <Field label="Y">
            <input type="number" value={Math.round(node.y)}
              onChange={e => updateNode(node.id, { y: Number(e.target.value) })}
              style={s.input} />
          </Field>
        </div>

        <Divider />

        <Field label="Visibilité">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              onClick={() => updateNode(node.id, { hidden: !node.hidden })}
              style={{
                ...s.stateBtn,
                background:  node.hidden ? '#1e293b' : '#0f2a1a',
                borderColor: node.hidden ? '#475569' : '#16a34a',
                color:       node.hidden ? '#64748b' : '#4ade80',
              }}
            >
              {node.hidden ? '○ Nœud masqué' : '● Nœud visible'}
            </button>
            <button
              onClick={() => updateNode(node.id, { labelHidden: !node.labelHidden })}
              disabled={!!node.hidden}
              style={{
                ...s.stateBtn,
                background:  node.labelHidden || node.hidden ? '#1e293b' : '#0f2a1a',
                borderColor: node.labelHidden || node.hidden ? '#475569' : '#16a34a',
                color:       node.labelHidden || node.hidden ? '#64748b' : '#4ade80',
                opacity:     node.hidden ? 0.4 : 1,
                cursor:      node.hidden ? 'not-allowed' : 'pointer',
              }}
            >
              {node.labelHidden || node.hidden ? '○ Nom masqué' : '● Nom visible'}
            </button>
          </div>
        </Field>

        <Divider />
        <DeleteButton onClick={() => deleteNode(node.id)} />
        <p style={s.hint}>Raccourci : Suppr. · Glissez pour déplacer</p>
      </aside>
    );
  }

  // ── Edge panel ──────────────────────────────────────────────────────────────

  if (selection?.type === 'edge') {
    const edge = edges.find(e => e.id === selection.id);
    if (!edge) return null;

    const fromNode = nodes.find(n => n.id === edge.fromNodeId);
    const toNode   = nodes.find(n => n.id === edge.toNodeId);
    const edgeSignals = signals.filter(sig => sig.edgeId === edge.id);
    const parentZone  = zones.find(z => z.edgeIds.includes(edge.id));
    const allZones    = zones;

    return (
      <aside style={s.panel}>
        <h3 style={s.title}>Tronçon</h3>
        <Divider />

        <div style={s.info}>
          <Badge>{fromNode?.label ?? '?'}</Badge>
          <span style={{ color: '#4a90d9' }}>→</span>
          <Badge>{toNode?.label ?? '?'}</Badge>
        </div>

        <p style={{ ...s.meta, marginTop: 10 }}>
          {edgeSignals.length === 0 ? 'Aucun signal' : `${edgeSignals.length} signal(s)`}
        </p>

        <Divider />

        <Field label="Zone CDV">
          <select
            value={parentZone?.id ?? ''}
            onChange={e => {
              if (e.target.value) assignEdgeToZone(e.target.value, edge.id);
            }}
            style={s.input}
          >
            <option value="">— aucune —</option>
            {allZones.map(z => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Courbure">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="range" min={-200} max={200} step={1}
              value={edge.curveOffset ?? 0}
              onChange={e => updateEdge(edge.id, { curveOffset: Number(e.target.value) })}
              style={{ flex: 1, accentColor: '#4a90d9' }}
            />
            <button
              onClick={() => updateEdge(edge.id, { curveOffset: 0 })}
              style={{ ...s.input, width: 'auto', padding: '4px 8px', cursor: 'pointer' }}
              title="Redresser"
            >↔</button>
          </div>
        </Field>

        <p style={s.hint}>Glissez la poignée bleue pour courber · Outil Signal + clic pour ajouter un signal</p>

        <Divider />
        <DeleteButton onClick={() => deleteEdge(edge.id)} />
      </aside>
    );
  }

  // ── Zone CDV panel ──────────────────────────────────────────────────────────

  if (selection?.type === 'zone') {
    const zone = zones.find(z => z.id === selection.id);
    if (!zone) return null;

    return (
      <aside style={s.panel}>
        <h3 style={s.title}>Zone CDV</h3>
        <Divider />

        <Field label="Libellé">
          <input
            value={zone.label}
            onChange={e => updateZone(zone.id, { label: e.target.value })}
            style={s.input}
          />
        </Field>

        <Field label="Tronçons inclus">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {zone.edgeIds.map(eid => {
              const edge = edges.find(e => e.id === eid);
              if (!edge) return null;
              const from = nodes.find(n => n.id === edge.fromNodeId)?.label ?? '?';
              const to   = nodes.find(n => n.id === edge.toNodeId)?.label   ?? '?';
              return (
                <div key={eid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ ...s.badge, flex: 1 }}>{from} → {to}</span>
                  <button
                    onClick={() => removeEdgeFromZone(zone.id, eid)}
                    title="Retirer de la zone"
                    style={s.removeEdgeBtn}
                  >✕</button>
                </div>
              );
            })}
            {zone.edgeIds.length === 0 && (
              <p style={s.meta}>Aucun tronçon</p>
            )}
          </div>
        </Field>

        <p style={s.hint}>
          Mode Zone CDV (W) + clic sur un tronçon pour l'ajouter/retirer de cette zone
        </p>

        <Field label="Simulation train">
          <button
            onClick={() => toggleZoneOccupied(zone.id)}
            style={{
              ...s.stateBtn,
              background:  zone.occupiedManual ? '#450a0a' : '#1e293b',
              borderColor: zone.occupiedManual ? '#dc2626' : '#475569',
              color:       zone.occupiedManual ? '#fca5a5' : '#64748b',
            }}
          >
            {zone.occupiedManual ? '🔴 Train présent' : '⚫ Zone libre'}
          </button>
        </Field>

        <Field label="Simulation dérangement CDV">
          <button
            onClick={() => setZoneDerangement(zone.id, !zone.derangement)}
            style={{
              ...s.stateBtn,
              background:  zone.derangement ? '#431407' : '#1e293b',
              borderColor: zone.derangement ? '#c2410c' : '#475569',
              color:       zone.derangement ? '#fdba74' : '#64748b',
            }}
          >
            {zone.derangement ? '🟠 Dérangement CDV' : '⚫ CDV normal'}
          </button>
        </Field>

        {(() => {
          const routesWithRole = Object.values(routes).filter(r =>
            r.zoneConditions.some(c => c.zoneId === zone.id)
          );
          return (
            <div style={{ marginTop: 8 }}>
              <div style={s.sectionLabel}>R\u00f4les dans les itin\u00e9raires</div>
              {routesWithRole.length === 0 ? (
                <div style={{ fontSize: 9, color: '#475569' }}>Zone non utilis\u00e9e dans les itin\u00e9raires</div>
              ) : (
                routesWithRole.map(route => {
                  const cond = route.zoneConditions.find(c => c.zoneId === zone.id)!;
                  const btn = Object.values(panelButtons).find(b => b.routeId === route.id);
                  const routeLabel = btn?.label ?? route.id.slice(-6);
                  const ris = routeInterlockingStates[route.id];
                  const isActive = ris?.buttonState === 'active' || ris?.buttonState === 'forming';
                  const isTransit = cond.roles.includes('transit');
                  const isCleared = isTransit && ris?.transitCleared.includes(zone.id);
                  const rolesStr = cond.roles.map(r => {
                    if (r === 'transit' && cond.transitIndex != null) return `transit (${cond.transitIndex}e)`;
                    return r;
                  }).join(' \u00b7 ');
                  return (
                    <div key={route.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 4, fontSize: 9,
                    }}>
                      <span style={{ fontFamily: 'monospace', color: isActive ? '#4a90d9' : '#94a3b8' }}>
                        {routeLabel}
                      </span>
                      <span style={{ color: isCleared ? '#14b8a6' : '#64748b' }}>
                        {rolesStr}{isCleared ? ' \u2713' : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        <Divider />
        <DeleteButton onClick={() => deleteZone(zone.id)} />
      </aside>
    );
  }

  // ── Signal panel ────────────────────────────────────────────────────────────

  if (selection?.type === 'signal') {
    const sig = signals.find(sig => sig.id === selection.id);
    if (!sig) return null;

    const edge     = edges.find(e => e.id === sig.edgeId);
    const fromNode = nodes.find(n => n.id === edge?.fromNodeId);
    const toNode   = nodes.find(n => n.id === edge?.toNodeId);

    return (
      <aside style={s.panel}>
        <h3 style={s.title}>Signal</h3>
        <Divider />

        <Field label="Nom">
          <input value={sig.label}
            onChange={e => updateSignal(sig.id, { label: e.target.value })}
            style={s.input} />
        </Field>

        <Field label="Sur le tronçon">
          <div style={s.info}>
            <Badge>{fromNode?.label ?? '?'}</Badge>
            <span style={{ color: '#4a90d9' }}>→</span>
            <Badge>{toNode?.label ?? '?'}</Badge>
          </div>
        </Field>

        <Field label="Position sur le tronçon">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 8, color: '#475569', fontFamily: 'monospace', whiteSpace: 'nowrap', minWidth: 20, textAlign: 'right' }}>
              {fromNode?.label ?? '?'}
            </span>
            <input
              type="range"
              min={0} max={100} step={1}
              value={Math.round(sig.position * 100)}
              onChange={e => updateSignal(sig.id, { position: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: '#4a90d9', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 8, color: '#475569', fontFamily: 'monospace', whiteSpace: 'nowrap', minWidth: 20 }}>
              {toNode?.label ?? '?'}
            </span>
          </div>
          <div style={{ fontSize: 9, color: '#4a90d9', fontFamily: 'monospace', textAlign: 'center' }}>
            {Math.round(sig.position * 100)} %
          </div>
        </Field>

        <Field label="Sens">
          <select
            value={sig.direction}
            onChange={e => updateSignal(sig.id, { direction: e.target.value as 'AtoB' | 'BtoA' })}
            style={s.input}
          >
            <option value="AtoB">{fromNode?.label} → {toNode?.label}</option>
            <option value="BtoA">{toNode?.label} → {fromNode?.label}</option>
          </select>
        </Field>

        <Field label="État">
          <button
            onClick={() => updateSignal(sig.id, { state: sig.state === 'open' ? 'closed' : 'open' })}
            style={{
              ...s.stateBtn,
              background:  sig.state === 'open' ? '#14532d' : '#4c0519',
              borderColor: sig.state === 'open' ? '#16a34a' : '#be185d',
              color:       sig.state === 'open' ? '#4ade80' : '#fb7185',
            }}
          >
            {sig.state === 'open' ? '● Ouvert (vert)' : '● Fermé (rouge)'}
          </button>
        </Field>

        {(() => {
          const routesUsingSignal = Object.values(routes).filter(r => r.signalIds.includes(sig.id));
          const activeRoutes = routesUsingSignal.map(r => ({ route: r, ris: routeInterlockingStates[r.id] }))
            .filter(({ ris }) => ris?.buttonState === 'active' || ris?.buttonState === 'forming');

          const getRouteLabel = (routeId: string) => {
            const btn = Object.values(panelButtons).find(b => b.routeId === routeId);
            return btn?.label ?? routeId.slice(-6);
          };

          return (
            <div style={{ marginTop: 8 }}>
              <div style={s.sectionLabel}>Enclenchements</div>
              {sig.state === 'maintained_open' && activeRoutes.length > 0 && (
                <div style={{
                  background: '#1a0d00', border: '1px solid #f9731655',
                  borderRadius: 3, padding: '5px 7px', marginBottom: 5,
                  fontSize: 10, color: '#f97316',
                }}>
                  &#8857; Maintenu ouvert par E.Ap
                  {activeRoutes.map(({ route }) => {
                    const approachCond = route.zoneConditions.find(c => c.roles.includes('approche'));
                    const approachZone = approachCond ? zones.find(z => z.id === approachCond.zoneId) : null;
                    return (
                      <div key={route.id} style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                        {getRouteLabel(route.id)}{approachZone ? ` — zone approche\u00a0: ${approachZone.label}` : ''}
                      </div>
                    );
                  })}
                </div>
              )}
              {sig.state === 'open' && activeRoutes.length > 0 && (
                <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 4 }}>
                  &#9650; Ouvert par itin\u00e9raire {activeRoutes.map(({ route }) => getRouteLabel(route.id)).join(', ')} via E.Pa
                </div>
              )}
              {activeRoutes.length === 0 && (
                <div style={{ fontSize: 9, color: '#475569' }}>Aucun itin\u00e9raire actif sur ce signal</div>
              )}
              {activeRoutes.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {activeRoutes.map(({ route, ris }) => {
                    const phase = ris?.buttonState === 'forming' ? 'FORMATION' : ris?.EAP_active ? 'E.Ap' : 'E.Pa';
                    return (
                      <div key={route.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 2 }}>
                        <span style={{ fontFamily: 'monospace' }}>{getRouteLabel(route.id)}</span>
                        <span style={{ color: '#94a3b8' }}>{phase}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Zone d'Approche (Z.Ap) ── */}
        {(() => {
          const routesUsingSignal = Object.values(routes).filter(r => r.signalIds.includes(sig.id));
          if (routesUsingSignal.length === 0) return null;

          const getRouteLabel = (routeId: string) => {
            const btn = Object.values(panelButtons).find(b => b.routeId === routeId);
            return btn?.label ?? routeId.slice(-6);
          };

          return (
            <>
              <Divider />
              <div style={s.sectionLabel}>Zone d'approche (Z.Ap)</div>
              <p style={{ ...s.hint, marginBottom: 6, marginTop: 0 }}>
                Zone dont l'occupation déclenche E.Ap et maintient le signal ouvert.
              </p>
              {routesUsingSignal.map(route => {
                const approachCond = route.zoneConditions.find(c => c.roles.includes('approche'));
                const currentZoneId = approachCond?.zoneId ?? '';
                return (
                  <div key={route.id} style={{ marginBottom: 8 }}>
                    <label style={{ ...s.label, color: '#94a3b8', marginBottom: 3 }}>
                      {getRouteLabel(route.id)}
                    </label>
                    <select
                      value={currentZoneId}
                      onChange={e => setRouteApproachZone(route.id, e.target.value || null)}
                      style={s.input}
                    >
                      <option value="">— aucune —</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>{z.label}</option>
                      ))}
                    </select>
                    {currentZoneId && (() => {
                      const ris = routeInterlockingStates[route.id];
                      const isActive = ris?.EAP_active;
                      return (
                        <div style={{ fontSize: 9, color: isActive ? '#f97316' : '#475569', marginTop: 2 }}>
                          {isActive ? '⚡ E.Ap actif' : '○ E.Ap inactif'}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </>
          );
        })()}

        <Divider />
        <DeleteButton onClick={() => deleteSignal(sig.id)} />
      </aside>
    );
  }

  // ── Switch panel ────────────────────────────────────────────────────────────

  if (selection?.type === 'switch') {
    const sw = switches.find(sw => sw.id === selection.id);
    if (!sw) return null;

    const edgeOptions = edges.map(e => {
      const from = nodes.find(n => n.id === e.fromNodeId)?.label ?? '?';
      const to   = nodes.find(n => n.id === e.toNodeId)?.label   ?? '?';
      return { id: e.id, label: `${from} → ${to}` };
    });

    function EdgeSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
      return (
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
          style={s.input}
        >
          <option value="">— aucune —</option>
          {edgeOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    }

    return (
      <aside style={s.panel}>
        <h3 style={s.title}>Aiguille</h3>
        <Divider />

        <Field label="Nom">
          <input value={sw.name}
            onChange={e => updateSwitch(sw.id, { name: e.target.value })}
            style={s.input} />
        </Field>

        <Field label="Nœud porteur">
          <div style={{ ...s.input, color: '#64748b', pointerEvents: 'none' as const }}>
            {nodes.find(n => n.id === sw.nodeId)?.label ?? '—'}
          </div>
        </Field>

        <Divider />

        {/* Auto-assign from geometry */}
        {(() => {
          const connectedCount = edges.filter(e =>
            e.fromNodeId === sw.nodeId || e.toNodeId === sw.nodeId
          ).length;
          const canAuto = connectedCount === 3;
          return (
            <button
              onClick={() => autoAssignSwitch(sw.id)}
              disabled={!canAuto}
              title={canAuto
                ? 'Assigne entrée / directe / déviée depuis la géométrie'
                : `Requiert exactement 3 tronçons sur ce nœud (${connectedCount} trouvé${connectedCount > 1 ? 's' : ''})`}
              style={{
                ...s.stateBtn,
                marginBottom: 8,
                background: canAuto ? '#0c2a4a' : '#1e293b',
                borderColor: canAuto ? '#3b82f6' : '#334155',
                color:       canAuto ? '#60a5fa' : '#334155',
                cursor:      canAuto ? 'pointer' : 'not-allowed',
                fontSize: 11,
              }}
            >
              ⟳ Auto-détecter entrée / directe / déviée
            </button>
          );
        })()}

        <Field label="Tronçon d'entrée">
          <EdgeSelect value={sw.entryEdgeId} onChange={id => updateSwitch(sw.id, { entryEdgeId: id })} />
        </Field>
        <Field label="Branche directe">
          <EdgeSelect value={sw.straightEdgeId} onChange={id => updateSwitch(sw.id, { straightEdgeId: id })} />
        </Field>
        <Field label="Branche déviée">
          <EdgeSelect value={sw.divergingEdgeId} onChange={id => updateSwitch(sw.id, { divergingEdgeId: id })} />
        </Field>

        <Field label="Zone propre (aiguille)">
          <select
            value={sw.zonePropreId ?? ''}
            onChange={e => updateSwitch(sw.id, { zonePropreId: e.target.value || null })}
            style={s.input}
          >
            <option value="">\u2014 aucune \u2014</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </Field>

        <Divider />

        <Field label="Position active">
          <button
            onClick={() => toggleSwitchPosition(sw.id)}
            style={{
              ...s.stateBtn,
              background:  sw.position === 'straight' ? '#14532d' : '#431407',
              borderColor: sw.position === 'straight' ? '#16a34a' : '#c2410c',
              color:       sw.position === 'straight' ? '#4ade80' : '#fb923c',
            }}
          >
            {sw.position === 'straight' ? '↔ Directe' : '↗ Déviée'}
          </button>
        </Field>

        <Field label="Verrouillage">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={sw.locked} onChange={() => toggleSwitchLock(sw.id)}
              style={{ accentColor: '#f59e0b', width: 14, height: 14 }} />
            <span style={{ color: sw.locked ? '#f59e0b' : '#64748b', fontSize: 12 }}>
              {sw.locked ? 'Verrouillée' : 'Déverrouillée'}
            </span>
          </label>
        </Field>

        {(() => {
          const routesUsingSwitch = Object.values(routes).filter(r => r.switchPositions[sw.id] !== undefined);
          const activeRoutes = routesUsingSwitch.map(r => ({ route: r, ris: routeInterlockingStates[r.id] }))
            .filter(({ ris }) => ris?.buttonState === 'active' || ris?.buttonState === 'forming');

          const getRouteLabel = (routeId: string) => {
            const btn = Object.values(panelButtons).find(b => b.routeId === routeId);
            return btn?.label ?? routeId.slice(-6);
          };

          const zpZone = sw.zonePropreId ? zones.find(z => z.id === sw.zonePropreId) : null;

          const isTransitInAnyActive = sw.zonePropreId
            ? activeRoutes.some(({ route }) =>
                route.zoneConditions.some(c => c.zoneId === sw.zonePropreId && c.roles.includes('transit'))
              )
            : false;

          const isClearedInAnyActive = sw.zonePropreId
            ? activeRoutes.some(({ ris }) => ris?.transitCleared.includes(sw.zonePropreId!))
            : false;

          return (
            <div style={{ marginTop: 8 }}>
              <div style={s.sectionLabel}>E.Pa / Zone propre</div>
              {sw.locked ? (
                <>
                  <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 4 }}>
                    Verrouill\u00e9e par E.Pa \u2014 {activeRoutes.map(({ route }) => getRouteLabel(route.id)).join(', ') || '\u2014'}
                  </div>
                  {zpZone && (
                    <div style={{ fontSize: 9, color: isTransitInAnyActive ? (isClearedInAnyActive ? '#14b8a6' : '#64748b') : '#94a3b8' }}>
                      Zone propre\u00a0: {zpZone.label}
                      {isTransitInAnyActive ? (isClearedInAnyActive ? ' \u2014 \u2713 lib\u00e9r\u00e9e' : ' \u2014 non lib\u00e9r\u00e9e') : ''}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>
                    Aiguille libre \u2014 aucun E.Pa actif
                  </div>
                  {zpZone && (
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>
                      Zone propre\u00a0: {zpZone.label}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        <Divider />

        {/* ── Discordance d'aiguille (Fiche 306) ─────────────────────────── */}
        {(() => {
          const bothDiscordant = sw.discordanceStraight && sw.discordanceDiverging;
          return (
            <div style={{ marginBottom: 10 }}>
              <div style={s.sectionLabel}>Discordance (DI)</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <button
                  onClick={() => setSwitchDiscordance(sw.id, 'straight', !sw.discordanceStraight)}
                  style={{
                    ...s.stateBtn, flex: 1, fontSize: 10,
                    background:  sw.discordanceStraight ? '#431407' : '#0c2a4a',
                    borderColor: sw.discordanceStraight ? '#c2410c' : '#334155',
                    color:       sw.discordanceStraight ? '#fb923c' : '#64748b',
                  }}
                >
                  {sw.discordanceStraight ? '⚠ Direct' : '↔ Direct'}
                </button>
                <button
                  onClick={() => setSwitchDiscordance(sw.id, 'diverging', !sw.discordanceDiverging)}
                  style={{
                    ...s.stateBtn, flex: 1, fontSize: 10,
                    background:  sw.discordanceDiverging ? '#431407' : '#0c2a4a',
                    borderColor: sw.discordanceDiverging ? '#c2410c' : '#334155',
                    color:       sw.discordanceDiverging ? '#fb923c' : '#64748b',
                  }}
                >
                  {sw.discordanceDiverging ? '⚠ D\u00e9vi\u00e9e' : '↗ D\u00e9vi\u00e9e'}
                </button>
              </div>
              {(sw.discordanceStraight || sw.discordanceDiverging) && (
                <div style={{ fontSize: 9, color: '#fb923c' }}>
                  {bothDiscordant
                    ? 'Position ind\u00e9termin\u00e9e \u2014 CIA en \u00e9chec (toutes branches)'
                    : sw.discordanceStraight
                      ? 'CIA \u00e9chec branche directe \u2014 Fiche 306'
                      : 'CIA \u00e9chec branche d\u00e9vi\u00e9e \u2014 Fiche 306'}
                </div>
              )}
            </div>
          );
        })()}

        <Divider />
        <DeleteButton onClick={() => deleteSwitch(sw.id)} />
        <p style={s.hint}>Raccourci : Suppr.</p>
      </aside>
    );
  }

  // ── TextLabel panel ─────────────────────────────────────────────────────────

  if (selection?.type === 'textLabel') {
    const lbl = textLabels.find(t => t.id === selection.id);
    if (!lbl) return null;

    return (
      <aside style={s.panel}>
        <h3 style={s.title}>Texte libre</h3>
        <Divider />

        <Field label="Contenu">
          <input value={lbl.text}
            onChange={e => updateTextLabel(lbl.id, { text: e.target.value })}
            style={s.input} />
        </Field>

        <Field label="Taille (px)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={8} max={72} step={1} value={lbl.fontSize}
              onChange={e => updateTextLabel(lbl.id, { fontSize: Number(e.target.value) })}
              style={{ flex: 1, accentColor: '#4a90d9' }} />
            <input type="number" min={8} max={72} value={lbl.fontSize}
              onChange={e => updateTextLabel(lbl.id, { fontSize: Math.max(8, Math.min(72, Number(e.target.value))) })}
              style={{ ...s.input, width: 52 }} />
          </div>
        </Field>

        <Field label="Position">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={s.label}>X</label>
              <input type="number" value={Math.round(lbl.x)}
                onChange={e => updateTextLabel(lbl.id, { x: Number(e.target.value) })}
                style={s.input} />
            </div>
            <div>
              <label style={s.label}>Y</label>
              <input type="number" value={Math.round(lbl.y)}
                onChange={e => updateTextLabel(lbl.id, { y: Number(e.target.value) })}
                style={s.input} />
            </div>
          </div>
        </Field>

        <Divider />
        <DeleteButton onClick={() => deleteTextLabel(lbl.id)} />
        <p style={s.hint}>Raccourci : Suppr. · Glissez pour déplacer</p>
      </aside>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  const modeHints: Record<string, string> = {
    select:    'Cliquez sur un objet pour le sélectionner.\n\nGlissez un nœud ou un texte pour déplacer.\n\nGlissez le nom d\'un nœud/signal/aiguille pour le repositionner.',
    addNode:   'Cliquez sur le canvas pour placer un nœud topologique.',
    addEdge:   'Cliquez sur un nœud de départ,\npuis sur un nœud d\'arrivée\npour créer un tronçon.',
    addSignal: 'Cliquez sur un tronçon\npour y ajouter un signal.',
    addSwitch: 'Cliquez sur un nœud pour y poser une aiguille.\n\nUn nœud ne peut porter qu\'une seule aiguille.',
    addText:   'Cliquez sur le canvas pour placer\nun texte libre.',
    editZone:  'Sélectionnez une zone CDV (clic sur son badge),\npuis cliquez sur un tronçon\npour l\'ajouter ou l\'en retirer.',
  };

  return (
    <aside style={s.panel}>
      <InterlockingSupervisionPanel />
      <ZoneSupervisionPanel />
      <h3 style={{ ...s.title, color: '#334155' }}>Propriétés</h3>
      <Divider />
      <p style={{ ...s.meta, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
        {modeHints[mode]}
      </p>
    </aside>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  panel: {
    width: 220, flexShrink: 0, padding: 14,
    background: '#0f172a', borderLeft: '1px solid #1e3a5f',
    overflowY: 'auto', fontFamily: 'system-ui, sans-serif',
  },
  title: { margin: 0, color: '#4a90d9', fontSize: 13, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' },
  label: { display: 'block', color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  input: {
    width: '100%', padding: '5px 8px', background: '#1e293b', color: 'white',
    border: '1px solid #334155', borderRadius: 4, fontSize: 12,
    fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none',
  },
  info:  { display: 'flex', alignItems: 'center', gap: 6 },
  badge: { background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' },
  meta:  { color: '#475569', fontSize: 11, margin: '4px 0' },
  hint:  { color: '#334155', fontSize: 10, marginTop: 8, lineHeight: 1.5 },
  deleteBtn: { width: '100%', padding: '6px 0', background: '#1a0a0a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  stateBtn:  { width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid', cursor: 'pointer', fontSize: 12, textAlign: 'left', fontFamily: 'monospace' },
  removeEdgeBtn: { flexShrink: 0, padding: '2px 6px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: 3, cursor: 'pointer', fontSize: 10, lineHeight: 1 },
  sectionLabel: { fontSize: 9, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
};
