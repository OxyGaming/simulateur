'use client';
import { useRef, useState, useEffect } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { useCanvasInteraction } from '@/hooks/useCanvasInteraction';
import { nodeCenter } from '@/lib/geometry';
import { NodePoint }   from './ZoneNode';
import { EdgeLine }    from './ConnectionLine';
import { SignalNode }  from './SignalNode';
import { SwitchNode, SwitchBranchVisibility }  from './SwitchNode';
import { TextLabelNode } from './TextLabelNode';
import { ZoneBadge, zoneColor } from './ZoneBadge';
import { TrainMarker } from './TrainMarker';

const NOOP   = () => {};
const NOOP_E = (_e: React.MouseEvent) => {};
const NOOP_LABEL: (type: string, id: string, offset: {x:number;y:number}, e: React.MouseEvent<SVGTextElement>) => void = () => {};

export function TcoCanvas({ readOnly = false }: { readOnly?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Wheel zoom / pan ────────────────────────────────────────────────────────
  const [vp, setVp] = useState({ zoom: 1, panX: 0, panY: 0 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = el.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;
      setVp(prev => {
        const newZoom = Math.min(8, Math.max(0.1, prev.zoom * factor));
        const af = newZoom / prev.zoom;
        return { zoom: newZoom, panX: svgX - (svgX - prev.panX) * af, panY: svgY - (svgY - prev.panY) * af };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const nodes          = useRailwayStore(s => s.nodes);
  const edges          = useRailwayStore(s => s.edges);
  const zones          = useRailwayStore(s => s.zones);
  const signals        = useRailwayStore(s => s.signals);
  const switches       = useRailwayStore(s => s.switches);
  const textLabels     = useRailwayStore(s => s.textLabels);
  const routes                  = useRailwayStore(s => s.routes);
  const panelButtons            = useRailwayStore(s => s.panelButtons);
  const routeInterlockingStates = useRailwayStore(s => s.routeInterlockingStates);
  const trains                  = useRailwayStore(s => s.trains);
  const blinkPhase              = useRailwayStore(s => s.blinkPhase);
  const diAlarmActive           = useRailwayStore(s => s.diAlarmActive);
  const diIndicatorPos          = useRailwayStore(s => s.diIndicatorPos);
  const mode           = useRailwayStore(s => s.mode);
  const selection      = useRailwayStore(s => s.selection);
  const pendingEdge    = useRailwayStore(s => s.pendingEdge);
  const testZoneActive    = useRailwayStore(s => s.testZoneActive);
  const testAiguilleActive = useRailwayStore(s => s.testAiguilleActive);

  const interaction = useCanvasInteraction(svgRef);
  const {
    mousePos,
    canvasCursor,
    nodeCursor,
    edgeCursor,
    textLabelCursor,
    svgHandlers,
  } = interaction;

  const onDiIndicatorMouseDown = readOnly ? undefined : interaction.onDiIndicatorMouseDown;

  // In readOnly mode all editing/selection handlers are disabled
  const onNodeMouseDown       = readOnly ? NOOP_E : interaction.onNodeMouseDown;
  const onNodeClick           = readOnly ? NOOP_E : interaction.onNodeClick;
  const onLabelMouseDown      = readOnly ? NOOP_LABEL : interaction.onLabelMouseDown;
  const onZapEapMouseDown     = readOnly ? undefined : interaction.onZapEapMouseDown;
  const onCurveHandleMouseDown= readOnly ? NOOP_E : interaction.onCurveHandleMouseDown;
  const onEdgeClick           = readOnly ? (_id: string, _pos: {x:number;y:number}, _e: React.MouseEvent) => {} : interaction.onEdgeClick;
  const onSignalClick         = readOnly ? NOOP_E : interaction.onSignalClick;
  const onSwitchClick         = readOnly ? NOOP_E : interaction.onSwitchClick;
  const onTextLabelMouseDown  = readOnly ? NOOP_E : interaction.onTextLabelMouseDown;
  const onTextLabelClick      = readOnly ? NOOP_E : interaction.onTextLabelClick;

  // Pre-compute edge→zone colour mapping
  const edgeZoneMap = new Map<string, { zoneId: string; colorIndex: number }>();
  zones.forEach((zone, idx) => {
    zone.edgeIds.forEach(eid => edgeZoneMap.set(eid, { zoneId: zone.id, colorIndex: idx }));
  });

  // Compute which edges belong to transit zones NOT YET cleared (yellow — transit en cours).
  // Only zones with explicit 'transit' role light up; non-transit route edges stay normal.
  // Cleared transit zones revert to standard appearance (no special colour).
  const activeRouteEdgeIds = new Set<string>();
  Object.values(panelButtons).forEach(btn => {
    if (btn.state !== 'active' || btn.type === 'fc' || !btn.routeId) return;
    const route = routes[btn.routeId];
    const ris   = routeInterlockingStates[btn.routeId];
    if (!route) return;
    route.zoneConditions
      .filter(c => c.roles.includes('transit') && !ris?.transitCleared.includes(c.zoneId))
      .forEach(c => {
        zones.find(z => z.id === c.zoneId)?.edgeIds.forEach(eid => activeRouteEdgeIds.add(eid));
      });
  });

  // Compute which edges are in a manually-occupied zone (zone.occupiedManual)
  const occupiedEdgeIds = new Set<string>();
  zones.forEach(zone => {
    if (zone.occupiedManual) {
      zone.edgeIds.forEach(eid => occupiedEdgeIds.add(eid));
    }
  });

  // Compute which edges are occupied by the simulated train (red — occupé)
  const trainOccupiedEdgeIds = new Set<string>();
  trains.forEach(train => {
    if (train.state !== 'terminated') {
      const trainZone = zones.find(z => z.edgeIds.includes(train.edgeId));
      if (trainZone) trainZone.edgeIds.forEach(eid => trainOccupiedEdgeIds.add(eid));
    }
  });

  // Test Zone: when held, illuminate all zones not occupied/derangement as transit
  if (testZoneActive) {
    zones.forEach(zone => {
      if (zone.derangement) return;
      const hasTrainOccupied = zone.edgeIds.some(eid => trainOccupiedEdgeIds.has(eid));
      if (hasTrainOccupied || zone.occupiedManual) return;
      zone.edgeIds.forEach(eid => activeRouteEdgeIds.add(eid));
    });
  }

  // Compute derangement zone edge sets
  const derangementEdgeIds = new Set<string>();  // derangement not annulled (orange)
  const annulledEdgeIds    = new Set<string>();  // derangement annulled (gray — EE neutralized)
  zones.forEach(zone => {
    if (!zone.derangement) return;
    const target = zone.annulled ? annulledEdgeIds : derangementEdgeIds;
    zone.edgeIds.forEach(eid => target.add(eid));
  });

  // Derive final state colour for each edge
  // Priority: train (rouge) > dérangement bloquant (orange) > dérangement annulé (gris) >
  //           occupation manuelle (rouge) > transit actif (jaune) > standard (null)
  // Cleared transit zones have no special colour — they revert to standard zone appearance.
  function edgeStateColor(edgeId: string): string | null {
    if (trainOccupiedEdgeIds.has(edgeId))   return '#dc2626'; // rouge  — train présent
    if (derangementEdgeIds.has(edgeId))     return '#c2410c'; // orange — dérangement bloquant
    if (annulledEdgeIds.has(edgeId))        return '#374151'; // gris   — dérangement annulé (EE neutralisé)
    if (occupiedEdgeIds.has(edgeId))        return '#dc2626'; // rouge  — occupation manuelle
    if (activeRouteEdgeIds.has(edgeId))     return '#f59e0b'; // jaune  — transit en cours
    return null;
  }

  // ── ZAp / EAp indicators per signal ────────────────────────────────────────
  // For each signal: does any of its routes have an approach zone configured?
  // If yes, compute occupation + EAp interlocking state.
  const annulatedZoneIds = new Set(
    Object.values(panelButtons)
      .filter(b => b.type === 'annulateur' && b.state === 'active')
      .flatMap(b => b.annulateurZoneIds),
  );

  function isZoneOccupiedForIndicator(zoneId: string): boolean {
    if (annulatedZoneIds.has(zoneId)) return false;
    const z = zones.find(zn => zn.id === zoneId);
    if (!z) return false;
    if (z.derangement && z.annulled) return false;
    if (z.derangement || z.occupiedManual) return true;
    return trains.some(t => t.state !== 'terminated' && z.edgeIds.includes(t.edgeId));
  }

  interface SignalApproachInfo { hasApproach: boolean; zapOccupied: boolean; eapActive: boolean }
  const signalApproachMap = new Map<string, SignalApproachInfo>();

  signals.forEach(sig => {
    // All routes that reference this signal
    const sigRoutes = Object.values(routes).filter(r => r.signalIds.includes(sig.id));
    // Approach zone IDs across those routes
    const approachZoneIds = sigRoutes.flatMap(r =>
      r.zoneConditions.filter(c => c.roles.includes('approche')).map(c => c.zoneId),
    );
    if (approachZoneIds.length === 0) return; // no approach zone → no indicator

    const zapOccupied = approachZoneIds.some(zid => isZoneOccupiedForIndicator(zid));
    const eapActive   = sigRoutes.some(r => {
      const ris = routeInterlockingStates[r.id];
      return ris?.buttonState === 'active' && ris?.EAP_active;
    });

    signalApproachMap.set(sig.id, { hasApproach: true, zapOccupied, eapActive });
  });

  const afSignalIds = new Set(trains.flatMap(t => t.afSignalIds ?? []));

  const pendingFromNode = pendingEdge
    ? nodes.find(n => n.id === pendingEdge.fromNodeId)
    : null;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: 'block', background: '#111827', cursor: readOnly ? 'default' : canvasCursor }}
      {...svgHandlers}
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
        </pattern>
      </defs>

      {/* ── Zoomable content group ─────────────────────────────────────────── */}
      <g transform={`translate(${vp.panX}, ${vp.panY}) scale(${vp.zoom})`}>

      {/* Grid fills a very large area so it always covers the viewport */}
      <rect x="-10000" y="-10000" width="30000" height="30000" fill="url(#grid)" pointerEvents="none" />

      {/* ── Free text labels (bottom layer) ───────────────────────────────── */}
      {textLabels.map(lbl => (
        <TextLabelNode
          key={lbl.id}
          label={lbl}
          isSelected={selection?.type === 'textLabel' && selection.id === lbl.id}
          cursor={textLabelCursor}
          onMouseDown={(e) => onTextLabelMouseDown(lbl.id, e)}
          onClick={(e) => onTextLabelClick(lbl.id, e)}
        />
      ))}

      {/* ── Edges (track segments) ────────────────────────────────────────── */}
      {edges.map(edge => {
        const fromNode = nodes.find(n => n.id === edge.fromNodeId);
        const toNode   = nodes.find(n => n.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;
        const p1 = nodeCenter(fromNode);
        const p2 = nodeCenter(toNode);
        const zoneInfo = edgeZoneMap.get(edge.id);
        const color = zoneInfo ? zoneColor(zoneInfo.colorIndex) : null;
        return (
          <EdgeLine
            key={edge.id}
            edge={edge}
            fromNode={fromNode}
            toNode={toNode}
            isSelected={selection?.type === 'edge' && selection.id === edge.id}
            zoneColor={color}
            stateColor={edgeStateColor(edge.id)}
            cursor={edgeCursor}
            onClick={(e, pos) => onEdgeClick(edge.id, pos, e)}
            onCurveHandleMouseDown={(e) => onCurveHandleMouseDown(edge.id, p1, p2, e)}
          />
        );
      })}

      {/* ── Zone CDV badges ───────────────────────────────────────────────── */}
      {zones.map((zone, idx) => {
        const isSelected = selection?.type === 'zone' && selection.id === zone.id;
        // In editZone mode with a zone already selected, non-selected badges must
        // let pointer events pass through so edge lines below are clickable.
        const blockPointer = mode === 'editZone' && selection?.type === 'zone' && !isSelected;
        return (
          <ZoneBadge
            key={zone.id}
            zone={zone}
            edges={edges}
            nodes={nodes}
            color={zoneColor(idx)}
            isSelected={isSelected}
            isEditMode={mode === 'editZone'}
            blockPointer={blockPointer}
            onClick={(e) => {
              e.stopPropagation();
              useRailwayStore.getState().setSelection({ type: 'zone', id: zone.id });
            }}
            onLabelMouseDown={(e) => onLabelMouseDown('zone', zone.id, zone.labelOffset, e)}
          />
        );
      })}

      {/* ── Signals ───────────────────────────────────────────────────────── */}
      {signals.map(sig => {
        const edge = edges.find(e => e.id === sig.edgeId);
        if (!edge) return null;
        const fromNode = nodes.find(n => n.id === edge.fromNodeId);
        const toNode   = nodes.find(n => n.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;
        return (
          <SignalNode
            key={sig.id}
            signal={sig}
            fromNode={fromNode}
            toNode={toNode}
            curveOffset={edge.curveOffset ?? 0}
            isSelected={selection?.type === 'signal' && selection.id === sig.id}
            zapOccupied={signalApproachMap.get(sig.id)?.zapOccupied ?? null}
            eapActive={signalApproachMap.get(sig.id)?.eapActive ?? false}
            hasAF={afSignalIds.has(sig.id)}
            onClick={(e) => onSignalClick(sig.id, e)}
            onLabelMouseDown={(e) => onLabelMouseDown('signal', sig.id, sig.labelOffset, e)}
            onZapEapMouseDown={onZapEapMouseDown
              ? (e) => onZapEapMouseDown(sig.id, sig.zapEapOffset ?? { x: 0, y: 0 }, e)
              : undefined}
          />
        );
      })}

      {/* ── Nodes (topology junction points) ─────────────────────────────── */}
      {nodes.map(node => (
        <NodePoint
          key={node.id}
          node={node}
          isSelected={selection?.type === 'node' && selection.id === node.id}
          isPendingSource={pendingEdge?.fromNodeId === node.id}
          cursor={nodeCursor}
          onMouseDown={(e) => onNodeMouseDown(node.id, e)}
          onClick={(e) => onNodeClick(node.id, e)}
          onLabelMouseDown={(e) => onLabelMouseDown('node', node.id, node.labelOffset, e)}
        />
      ))}

      {/* ── Switches (after nodes → click priority) ───────────────────────── */}
      {switches.map(sw => {
        const node = nodes.find(n => n.id === sw.nodeId);
        if (!node) return null;

        function otherNode(edgeId: string | null) {
          if (!edgeId) return null;
          const edge = edges.find(e => e.id === edgeId);
          if (!edge) return null;
          const otherId = edge.fromNodeId === sw.nodeId ? edge.toNodeId : edge.fromNodeId;
          return nodes.find(n => n.id === otherId) ?? null;
        }

        const branchVisibility: SwitchBranchVisibility = readOnly
          ? (testAiguilleActive ? 'active-only' : 'hidden')
          : 'full';

        return (
          <SwitchNode
            key={sw.id}
            sw={sw}
            node={node}
            entryNode={otherNode(sw.entryEdgeId)}
            straightNode={otherNode(sw.straightEdgeId)}
            divergingNode={otherNode(sw.divergingEdgeId)}
            isSelected={selection?.type === 'switch' && selection.id === sw.id}
            diAlarmActive={diAlarmActive}
            branchVisibility={branchVisibility}
            onClick={(e) => onSwitchClick(sw.id, e)}
            onLabelMouseDown={(e) => onLabelMouseDown('switch', sw.id, sw.labelOffset, e)}
          />
        );
      })}

      {/* ── Train markers ────────────────────────────────────────────────── */}
      {trains.map(train => {
        const edge = edges.find(e => e.id === train.edgeId);
        if (!edge) return null;
        const fromNode = nodes.find(n => n.id === edge.fromNodeId);
        const toNode   = nodes.find(n => n.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;
        return (
          <TrainMarker
            key={train.id}
            train={train}
            edge={edge}
            fromNode={fromNode}
            toNode={toNode}
          />
        );
      })}

      {/* ── DI indicator (Discordance d'Aiguille) ────────────────────────── */}
      {diAlarmActive && (() => {
        const cx = diIndicatorPos.x;
        const cy = diIndicatorPos.y;
        const lit = blinkPhase;
        return (
          <g
            style={{ cursor: onDiIndicatorMouseDown ? 'grab' : 'default' }}
            onMouseDown={onDiIndicatorMouseDown
              ? (e) => onDiIndicatorMouseDown(diIndicatorPos, e)
              : undefined}
          >
            {/* hit area */}
            <circle cx={cx} cy={cy} r={18} fill="transparent" />
            {/* outer glow */}
            <circle cx={cx} cy={cy} r={14}
              fill="none" stroke="#ef4444" strokeWidth={3}
              opacity={lit ? 0.4 : 0.1} pointerEvents="none" />
            {/* body */}
            <circle cx={cx} cy={cy} r={10}
              fill={lit ? '#dc2626' : '#450a0a'}
              stroke="#ef4444" strokeWidth={1.5}
              opacity={lit ? 1 : 0.5}
              pointerEvents="none" />
            <text x={cx} y={cy}
              textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={8} fontFamily="monospace" fontWeight="bold"
              pointerEvents="none">
              DI
            </text>
          </g>
        );
      })()}

      {/* ── Pending edge preview line ─────────────────────────────────────── */}
      {pendingFromNode && mode === 'addEdge' && (
        <line
          x1={nodeCenter(pendingFromNode).x}
          y1={nodeCenter(pendingFromNode).y}
          x2={mousePos.x}
          y2={mousePos.y}
          stroke="#f39c12"
          strokeWidth={1.5}
          strokeDasharray="6,4"
          pointerEvents="none"
          opacity={0.7}
        />
      )}

      </g>{/* end zoomable group */}
    </svg>
  );
}
