'use client';
import { useRef, useState, useEffect } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { Point, quadraticControlPoint } from '@/lib/geometry';
import { LabelOffset } from '@/types/railway';

// ─── Drag state ───────────────────────────────────────────────────────────────

type DragState =
  | { kind: 'node';      id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { kind: 'textLabel'; id: string; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { kind: 'diIndicator'; startMouseX: number; startMouseY: number; startX: number; startY: number }
  | { kind: 'label';
      objectType: 'node' | 'signal' | 'switch' | 'zone' | 'signalZapEap';
      id: string;
      startMouseX: number; startMouseY: number;
      startOffsetX: number; startOffsetY: number;
    }
  | { kind: 'edgeCurve';
      id: string;
      p1x: number; p1y: number;
      p2x: number; p2y: number;
    };

const DRAG_THRESHOLD = 4;
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasInteraction(svgRef: React.RefObject<SVGSVGElement | null>) {
  const dragRef       = useRef<DragState | null>(null);
  const wasDraggedRef = useRef(false);

  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

  const nodes       = useRailwayStore(s => s.nodes);
  const mode        = useRailwayStore(s => s.mode);
  const pendingEdge = useRailwayStore(s => s.pendingEdge);

  function store() { return useRailwayStore.getState(); }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      const inInput = INPUT_TAGS.has(tag);

      if (e.key === 'Escape') { store().setMode('select'); return; }

      if (!inInput) {
        if (e.key === 'v' || e.key === 'V') { store().setMode('select');    return; }
        if (e.key === 'z' || e.key === 'Z') { store().setMode('addNode');   return; }
        if (e.key === 'c' || e.key === 'C') { store().setMode('addEdge');   return; }
        if (e.key === 's' || e.key === 'S') { store().setMode('addSignal'); return; }
        if (e.key === 'a' || e.key === 'A') { store().setMode('addSwitch'); return; }
        if (e.key === 't' || e.key === 'T') { store().setMode('addText');   return; }
        if (e.key === 'w' || e.key === 'W') { store().setMode('editZone');  return; }
        if (e.key === 'x' || e.key === 'X') { store().setMode('addTrain');  return; }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          const s   = store();
          const sel = s.selection;
          if (!sel) return;
          if      (sel.type === 'node')      s.deleteNode(sel.id);
          else if (sel.type === 'edge')      s.deleteEdge(sel.id);
          else if (sel.type === 'zone')      s.deleteZone(sel.id);
          else if (sel.type === 'signal')    s.deleteSignal(sel.id);
          else if (sel.type === 'switch')    s.deleteSwitch(sel.id);
          else if (sel.type === 'textLabel') s.deleteTextLabel(sel.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── SVG coordinate helper ───────────────────────────────────────────────────

  function getSvgPoint(e: React.MouseEvent): Point {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ── SVG background click ────────────────────────────────────────────────────

  function onSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (e.target !== e.currentTarget) return;
    const p = getSvgPoint(e);

    if (mode === 'addNode') {
      store().addNode(p.x, p.y);
    } else if (mode === 'addText') {
      store().addTextLabel(p.x, p.y);
    } else if (mode === 'select' || mode === 'editZone' || mode === 'addTrain') {
      store().setSelection(null);
    } else if (mode === 'addEdge') {
      store().setPendingEdge(null);
    }
  }

  // ── Mouse move ──────────────────────────────────────────────────────────────

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const p = getSvgPoint(e);
    setMousePos(p);

    const drag = dragRef.current;
    if (!drag) return;

    // Edge curve handle: follows mouse directly, no threshold
    if (drag.kind === 'edgeCurve') {
      wasDraggedRef.current = true;
      const { p1x, p1y, p2x, p2y } = drag;
      const mx = (p1x + p2x) / 2;
      const my = (p1y + p2y) / 2;
      const segLen = Math.sqrt((p2x - p1x) ** 2 + (p2y - p1y) ** 2) || 1;
      const perpX = -(p2y - p1y) / segLen;
      const perpY =  (p2x - p1x) / segLen;
      const newOffset = (p.x - mx) * perpX + (p.y - my) * perpY;
      store().updateEdge(drag.id, { curveOffset: newOffset });
      return;
    }

    const dx = p.x - drag.startMouseX;
    const dy = p.y - drag.startMouseY;

    if (!wasDraggedRef.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      wasDraggedRef.current = true;
    }

    switch (drag.kind) {
      case 'node':
        store().updateNode(drag.id, { x: drag.startX + dx, y: drag.startY + dy });
        break;
      case 'textLabel':
        store().updateTextLabel(drag.id, { x: drag.startX + dx, y: drag.startY + dy });
        break;
      case 'diIndicator':
        store().setDiIndicatorPos({ x: drag.startX + dx, y: drag.startY + dy });
        break;
      case 'label': {
        const newOffset: LabelOffset = { x: drag.startOffsetX + dx, y: drag.startOffsetY + dy };
        if      (drag.objectType === 'node')         store().updateNode(drag.id,   { labelOffset: newOffset });
        else if (drag.objectType === 'signal')       store().updateSignal(drag.id, { labelOffset: newOffset });
        else if (drag.objectType === 'switch')       store().updateSwitch(drag.id, { labelOffset: newOffset });
        else if (drag.objectType === 'zone')         store().updateZone(drag.id,   { labelOffset: newOffset });
        else if (drag.objectType === 'signalZapEap') store().updateSignal(drag.id, { zapEapOffset: newOffset });
        break;
      }
    }
  }

  function onMouseUp() { dragRef.current = null; }

  // ── Node interactions ───────────────────────────────────────────────────────

  function onNodeMouseDown(nodeId: string, e: React.MouseEvent) {
    if (mode !== 'select') return;
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const p = getSvgPoint(e);
    dragRef.current = { kind: 'node', id: nodeId, startMouseX: p.x, startMouseY: p.y, startX: node.x, startY: node.y };
    wasDraggedRef.current = false;
  }

  function onNodeClick(nodeId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (wasDraggedRef.current) { wasDraggedRef.current = false; return; }

    if (mode === 'select') {
      store().setSelection({ type: 'node', id: nodeId });
    } else if (mode === 'addEdge') {
      if (!pendingEdge) {
        store().setPendingEdge({ fromNodeId: nodeId });
      } else if (pendingEdge.fromNodeId === nodeId) {
        store().setPendingEdge(null);
      } else {
        store().addEdge(pendingEdge.fromNodeId, nodeId);
      }
    } else if (mode === 'addSwitch') {
      store().addSwitch(nodeId);
    }
  }

  // ── Label drag interactions ─────────────────────────────────────────────────

  function onLabelMouseDown(
    objectType: 'node' | 'signal' | 'switch' | 'zone',
    id: string,
    currentOffset: LabelOffset,
    e: React.MouseEvent,
  ) {
    if (mode !== 'select') return;
    e.stopPropagation();
    const p = getSvgPoint(e);
    dragRef.current = {
      kind: 'label', objectType, id,
      startMouseX: p.x, startMouseY: p.y,
      startOffsetX: currentOffset.x, startOffsetY: currentOffset.y,
    };
    wasDraggedRef.current = false;
  }

  // ── DI indicator drag ─────────────────────────────────────────────────────

  function onDiIndicatorMouseDown(currentPos: { x: number; y: number }, e: React.MouseEvent) {
    if (mode !== 'select') return;
    e.stopPropagation();
    const p = getSvgPoint(e);
    dragRef.current = {
      kind: 'diIndicator',
      startMouseX: p.x, startMouseY: p.y,
      startX: currentPos.x, startY: currentPos.y,
    };
    wasDraggedRef.current = false;
  }

  // ── ZAp/EAp indicator drag ─────────────────────────────────────────────────

  function onZapEapMouseDown(sigId: string, currentOffset: LabelOffset, e: React.MouseEvent) {
    if (mode !== 'select') return;
    e.stopPropagation();
    const p = getSvgPoint(e);
    dragRef.current = {
      kind: 'label', objectType: 'signalZapEap', id: sigId,
      startMouseX: p.x, startMouseY: p.y,
      startOffsetX: currentOffset.x, startOffsetY: currentOffset.y,
    };
    wasDraggedRef.current = false;
  }

  // ── Edge curve handle drag ──────────────────────────────────────────────────

  function onCurveHandleMouseDown(edgeId: string, p1: Point, p2: Point, e: React.MouseEvent) {
    if (mode !== 'select') return;
    e.stopPropagation();
    dragRef.current = { kind: 'edgeCurve', id: edgeId, p1x: p1.x, p1y: p1.y, p2x: p2.x, p2y: p2.y };
    wasDraggedRef.current = false;
  }

  // ── Edge interactions ───────────────────────────────────────────────────────

  function onEdgeClick(edgeId: string, clickPosition: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (mode === 'addSignal') {
      store().addSignal(edgeId, 'AtoB', clickPosition);
    } else if (mode === 'select') {
      store().setSelection({ type: 'edge', id: edgeId });
    } else if (mode === 'addTrain') {
      store().placeTrain(edgeId, clickPosition);
      store().setMode('select');
    } else if (mode === 'editZone') {
      // Toggle edge into/out of the currently selected CDV zone
      const sel = store().selection;
      if (sel?.type === 'zone') {
        const zone = store().zones.find(z => z.id === sel.id);
        if (zone?.edgeIds.includes(edgeId)) {
          store().removeEdgeFromZone(sel.id, edgeId);
        } else {
          store().assignEdgeToZone(sel.id, edgeId);
        }
      } else {
        // Select the edge so the panel can show which zone it belongs to
        store().setSelection({ type: 'edge', id: edgeId });
      }
    }
  }

  // ── Signal interactions ─────────────────────────────────────────────────────

  function onSignalClick(sigId: string, e: React.MouseEvent) {
    e.stopPropagation();
    store().setSelection({ type: 'signal', id: sigId });
  }

  // ── Switch interactions ─────────────────────────────────────────────────────

  function onSwitchClick(switchId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (mode === 'select') {
      store().setSelection({ type: 'switch', id: switchId });
    }
  }

  // ── Text label interactions ─────────────────────────────────────────────────

  function onTextLabelMouseDown(id: string, e: React.MouseEvent) {
    if (mode !== 'select') return;
    e.stopPropagation();
    const lbl = store().textLabels.find(t => t.id === id);
    if (!lbl) return;
    const p = getSvgPoint(e);
    dragRef.current = { kind: 'textLabel', id, startMouseX: p.x, startMouseY: p.y, startX: lbl.x, startY: lbl.y };
    wasDraggedRef.current = false;
  }

  function onTextLabelClick(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (wasDraggedRef.current) { wasDraggedRef.current = false; return; }
    store().setSelection({ type: 'textLabel', id });
  }

  // ── Cursors ─────────────────────────────────────────────────────────────────

  const canvasCursor: React.CSSProperties['cursor'] =
    mode === 'addNode' || mode === 'addSignal' || mode === 'addText' || mode === 'addTrain' ? 'crosshair' : 'default';

  const nodeCursor: React.CSSProperties['cursor'] =
    mode === 'select'   ? 'move'
    : mode === 'addEdge'  ? 'pointer'
    : mode === 'addSwitch' ? 'cell'
    : 'default';

  const edgeCursor: React.CSSProperties['cursor'] =
    mode === 'addSignal' || mode === 'editZone' || mode === 'addTrain' ? 'crosshair' : 'pointer';

  const textLabelCursor: React.CSSProperties['cursor'] =
    mode === 'select' ? 'move' : 'default';

  return {
    mousePos,
    canvasCursor,
    nodeCursor,
    edgeCursor,
    textLabelCursor,
    svgHandlers: {
      onClick:      onSvgClick,
      onMouseMove:  onMouseMove,
      onMouseUp:    onMouseUp,
      onMouseLeave: onMouseUp,
    },
    onNodeMouseDown,
    onNodeClick,
    onLabelMouseDown,
    onZapEapMouseDown,
    onDiIndicatorMouseDown,
    onCurveHandleMouseDown,
    onEdgeClick,
    onSignalClick,
    onSwitchClick,
    onTextLabelMouseDown,
    onTextLabelClick,
  };
}
