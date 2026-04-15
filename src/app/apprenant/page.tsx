'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { TcoCanvas } from '@/components/TcoCanvas';
import { LearnerPupitreCanvas } from '@/components/LearnerPupitreCanvas';
import { useSyncReceiver } from '@/hooks/useSyncReceiver';
import { useLearnerActionPublisher } from '@/hooks/useLearnerActionPublisher';
import type { LearnerAction } from '@/types/sync';

const MIN_PUPITRE_H     = 120;
const MAX_PUPITRE_H     = 600;
const DEFAULT_PUPITRE_H = 280;

export default function ApprenantPage() {
  // ── Code de session (lu depuis l'URL) ──────────────────────────────────────
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [inputCode,   setInputCode]   = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('session');
    if (code) { setSessionCode(code.toUpperCase()); setSessionReady(true); }
  }, []);

  function joinSession() {
    const code = inputCode.trim().toUpperCase();
    if (code.length < 2) return;
    // Met à jour l'URL sans recharger la page
    const url = new URL(window.location.href);
    url.searchParams.set('session', code);
    window.history.replaceState(null, '', url.toString());
    setSessionCode(code);
    setSessionReady(true);
  }

  const { status } = useSyncReceiver(sessionCode);
  useLearnerActionPublisher(sessionCode);

  // ── Direct action sender (bypasse le store local) ─────────────────────────
  const sendDirectAction = useCallback((action: LearnerAction) => {
    if (!sessionCode) return;
    fetch(`/api/sync/action?session=${encodeURIComponent(sessionCode)}`, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(action),
      keepalive: true,
    }).catch(() => {});
  }, [sessionCode]);

  const handleSyncButtonPress = useCallback((buttonId: string) => {
    sendDirectAction({ type: 'pressButton', buttonId });
  }, [sendDirectAction]);

  // ── Resize pupitre ─────────────────────────────────────────────────────────
  const [pupitreH, setPupitreH] = useState(DEFAULT_PUPITRE_H);
  const isDragging = useRef(false);
  const startY     = useRef(0);
  const startH     = useRef(DEFAULT_PUPITRE_H);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dy  = startY.current - e.clientY;
      const newH = Math.min(MAX_PUPITRE_H, Math.max(MIN_PUPITRE_H, startH.current + dy));
      setPupitreH(newH);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Écran de saisie du code si pas de session dans l'URL ──────────────────
  if (!sessionReady) {
    return (
      <div style={joinLayout.root}>
        <div style={joinLayout.card}>
          <div style={joinLayout.logo}>PRS Simulator</div>
          <div style={joinLayout.subtitle}>Vue Apprenant</div>
          <div style={joinLayout.label}>Code de session</div>
          <input
            style={joinLayout.input}
            value={inputCode}
            onChange={e => setInputCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') joinSession(); }}
            placeholder="ex : ZX7K"
            maxLength={8}
            autoFocus
          />
          <button style={joinLayout.btn} onClick={joinSession}>
            Rejoindre la session
          </button>
          <div style={joinLayout.hint}>
            Le formateur vous communique ce code.
          </div>
        </div>
      </div>
    );
  }

  // ── Vue principale ─────────────────────────────────────────────────────────
  return (
    <div style={layout.root}>
      {/* Header */}
      <div style={layout.header}>
        <span style={layout.title}>PRS Simulator — Vue Apprenant</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Badge session */}
          <span style={layout.sessionBadge}>
            SESSION&nbsp;<strong style={{ letterSpacing: 4, color: '#38bdf8' }}>{sessionCode}</strong>
          </span>
          {/* Statut connexion */}
          <span style={{
            ...layout.statusDot,
            background: status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#ef4444',
          }} title={status} />
          <span style={layout.statusText}>
            {status === 'connected' ? 'Connecté' : status === 'connecting' ? 'Connexion…' : 'Déconnecté'}
          </span>
          {/* Lien formateur */}
          <a href="/" style={layout.link}>← Vue Formateur</a>
        </div>
      </div>

      {/* Bannière d'erreur si déconnecté */}
      {status === 'disconnected' && (
        <div style={layout.errorBanner}>
          ✕ Connexion perdue — reconnexion en cours…
        </div>
      )}

      <div style={layout.canvas}>
        <TcoCanvas readOnly />
      </div>

      <div
        style={layout.divider}
        onMouseDown={e => { isDragging.current = true; startY.current = e.clientY; startH.current = pupitreH; e.preventDefault(); }}
      >
        <div style={layout.dividerGrip} />
      </div>

      <div style={{ height: pupitreH, flexShrink: 0, overflow: 'hidden' }}>
        <LearnerPupitreCanvas
          disableActivation={!!sessionCode}
          onSyncButtonPress={sessionCode ? handleSyncButtonPress : undefined}
        />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const layout: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0f1e', color: 'white', fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', background: '#080e1a', borderBottom: '1px solid #1e3a5f', flexShrink: 0 },
  title: { fontSize: 11, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' as const, color: '#4a90d9' },
  sessionBadge: { fontSize: 10, fontFamily: 'monospace', color: '#64748b', background: '#0f172a', border: '1px solid #1e3a5f', padding: '2px 8px', borderRadius: 3 },
  statusDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  statusText: { fontSize: 10, fontFamily: 'monospace', color: '#64748b' },
  link: { fontSize: 10, fontFamily: 'monospace', color: '#475569', textDecoration: 'none', padding: '3px 8px', border: '1px solid #334155', borderRadius: 3 },
  errorBanner: { background: '#2a1c1c', color: '#fca5a5', borderBottom: '1px solid #7f1d1d', textAlign: 'center' as const, padding: '4px 0', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 },
  canvas: { flex: 1, overflow: 'hidden', position: 'relative' as const },
  divider: { height: 6, flexShrink: 0, cursor: 'row-resize', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #1e3a5f', borderBottom: '1px solid #1e3a5f' },
  dividerGrip: { width: 40, height: 2, borderRadius: 2, background: '#334155', pointerEvents: 'none' as const },
};

const joinLayout: Record<string, React.CSSProperties> = {
  root: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0f1e', fontFamily: 'system-ui, -apple-system, sans-serif' },
  card: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 10, padding: '36px 40px', width: 320 },
  logo: { fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: 2 },
  subtitle: { fontSize: 12, fontFamily: 'monospace', color: '#475569', textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: 8 },
  label: { fontSize: 11, fontFamily: 'monospace', color: '#64748b', alignSelf: 'flex-start' },
  input: { width: '100%', padding: '10px 14px', fontSize: 22, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 8, textAlign: 'center' as const, background: '#0a0f1e', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', outline: 'none', boxSizing: 'border-box' as const, textTransform: 'uppercase' as const },
  btn: { width: '100%', padding: '10px 0', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' },
  hint: { fontSize: 11, color: '#475569', fontFamily: 'monospace', textAlign: 'center' as const },
};
