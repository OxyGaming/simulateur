'use client';
import { useEffect, useRef, useState } from 'react';
import { Toolbar } from '@/components/Toolbar';
import { TcoCanvas } from '@/components/TcoCanvas';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { PupitrePanel } from '@/components/PupitrePanel';
import { SimulationPanel } from '@/components/SimulationPanel';
import { useRailwayStore } from '@/store/useRailwayStore';

const MIN_PUPITRE_W = 120;
const MAX_PUPITRE_W = 520;
const DEFAULT_PUPITRE_W = 220;

const STATUS_HINTS: Record<string, string> = {
  addNode:   'Cliquez sur le canvas pour placer un nœud',
  addSignal: 'Cliquez sur un tronçon pour placer un signal',
  addText:   'Cliquez sur le canvas pour placer un texte',
  editZone:  'Sélectionnez une zone CDV, puis cliquez sur les tronçons',
  addTrain:  'Cliquez sur un tronçon pour placer le train',
};

export default function Page() {
  const mode        = useRailwayStore(s => s.mode);
  const pendingEdge = useRailwayStore(s => s.pendingEdge);
  const undo        = useRailwayStore(s => s.undo);

  // ── Resizable pupitre width ────────────────────────────────────────────────
  const [pupitreW, setPupitreW] = useState(DEFAULT_PUPITRE_W);
  const dragging  = useRef(false);
  const startX    = useRef(0);
  const startW    = useRef(DEFAULT_PUPITRE_W);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      setPupitreW(Math.min(MAX_PUPITRE_W, Math.max(MIN_PUPITRE_W, startW.current + dx)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Ctrl+Z ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  const edgeHint = mode === 'addEdge'
    ? pendingEdge
      ? 'Cliquez sur le nœud de destination — Échap pour annuler'
      : 'Cliquez sur le nœud de départ'
    : null;

  const statusHint = edgeHint ?? STATUS_HINTS[mode] ?? null;

  return (
    <div style={layout.root}>
      <Toolbar />
      <div style={layout.workspace}>
        {/* Pupitre PRS — panneau gauche */}
        <PupitrePanel width={pupitreW} />

        {/* Drag handle */}
        <div
          onMouseDown={(e) => {
            dragging.current = true;
            startX.current = e.clientX;
            startW.current = pupitreW;
            e.preventDefault();
          }}
          style={{
            width: 5,
            cursor: 'col-resize',
            background: '#1e3a5f',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1e3a5f')}
        />

        {/* Canvas */}
        <div style={layout.canvas}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TcoCanvas />
            {statusHint && (
              <div style={layout.toast}>
                {statusHint}
              </div>
            )}
          </div>
          <SimulationPanel />
        </div>

        {/* Properties */}
        <PropertiesPanel />
      </div>
    </div>
  );
}

const layout: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0a0f1e',
    color: 'white',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  workspace: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid #334155',
    color: '#94a3b8',
    padding: '6px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontFamily: 'monospace',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(4px)',
  },
};
