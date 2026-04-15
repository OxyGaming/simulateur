'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { TcoCanvas } from '@/components/TcoCanvas';
import { LearnerPupitreCanvas } from '@/components/LearnerPupitreCanvas';
import { useSyncReceiver } from '@/hooks/useSyncReceiver';
import { useLearnerActionPublisher } from '@/hooks/useLearnerActionPublisher';

const MIN_PUPITRE_H = 120;
const MAX_PUPITRE_H = 600;
const DEFAULT_PUPITRE_H = 280;

export default function ApprenantPage() {
  const { status } = useSyncReceiver();
  useLearnerActionPublisher();

  const [pupitreH, setPupitreH] = useState(DEFAULT_PUPITRE_H);
  const isDragging    = useRef(false);
  const startY        = useRef(0);
  const startH        = useRef(DEFAULT_PUPITRE_H);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dy = startY.current - e.clientY; // drag up → increase height
      const newH = Math.min(MAX_PUPITRE_H, Math.max(MIN_PUPITRE_H, startH.current + dy));
      setPupitreH(newH);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function onDividerMouseDown(e: React.MouseEvent) {
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = pupitreH;
    e.preventDefault();
  }

  return (
    <div style={layout.root}>
      {/* Compact header */}
      <div style={layout.header}>
        <span style={layout.title}>PRS Simulator — Vue Apprenant</span>
        <Link href="/" style={layout.link}>
          ← Vue Formateur
        </Link>
      </div>

      {/* Bannière statut de connexion */}
      {status !== 'connected' && (
        <div style={{
          background:  status === 'connecting' ? '#1c2a1c' : '#2a1c1c',
          color:       status === 'connecting' ? '#4ade80' : '#fca5a5',
          borderBottom: `1px solid ${status === 'connecting' ? '#166534' : '#7f1d1d'}`,
          textAlign:   'center',
          padding:     '4px 0',
          fontSize:    11,
          fontFamily:  'monospace',
          flexShrink:  0,
        }}>
          {status === 'connecting' ? '⟳ Connexion au formateur…' : '✕ Connexion perdue — reconnexion en cours…'}
        </div>
      )}

      {/* TCO Canvas — haut */}
      <div style={layout.canvas}>
        <TcoCanvas readOnly />
      </div>

      {/* Resize handle */}
      <div style={layout.divider} onMouseDown={onDividerMouseDown}>
        <div style={layout.dividerGrip} />
      </div>

      {/* Pupitre libre — bas, hauteur contrôlée */}
      <div style={{ height: pupitreH, flexShrink: 0, overflow: 'hidden' }}>
        <LearnerPupitreCanvas />
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
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    background: '#080e1a',
    borderBottom: '1px solid #1e3a5f',
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: '#4a90d9',
  },
  link: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#475569',
    textDecoration: 'none',
    padding: '3px 8px',
    border: '1px solid #334155',
    borderRadius: 3,
  },
  canvas: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  divider: {
    height: 6,
    flexShrink: 0,
    cursor: 'row-resize',
    background: '#0a0f1e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderTop: '1px solid #1e3a5f',
    borderBottom: '1px solid #1e3a5f',
  },
  dividerGrip: {
    width: 40,
    height: 2,
    borderRadius: 2,
    background: '#334155',
    pointerEvents: 'none' as const,
  },
};
