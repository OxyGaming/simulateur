'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toolbar } from '@/components/Toolbar';
import { TcoCanvas } from '@/components/TcoCanvas';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { PupitrePanel } from '@/components/PupitrePanel';
import { SimulationPanel } from '@/components/SimulationPanel';
import { useRailwayStore } from '@/store/useRailwayStore';
import { useSyncPublisher } from '@/hooks/useSyncPublisher';
import { useTrainerActionReceiver } from '@/hooks/useTrainerActionReceiver';
import { useIsNarrow, useLockBodyScroll } from '@/hooks/useMediaQuery';
import { ApiError, layoutsApi, type SnapshotMeta } from '@/lib/api-client';
import { LAYOUT_SCHEMA_VERSION, type LayoutPayload } from '@/lib/schemas/layout';
import { HistoryDrawer } from './HistoryDrawer';

const MIN_PUPITRE_W     = 120;
const MAX_PUPITRE_W     = 520;
const DEFAULT_PUPITRE_W = 220;

const STATUS_HINTS: Record<string, string> = {
  addNode:   'Cliquez sur le canvas pour placer un nœud',
  addSignal: 'Cliquez sur un tronçon pour placer un signal',
  addText:   'Cliquez sur le canvas pour placer un texte',
  editZone:  'Sélectionnez une zone CDV, puis cliquez sur les tronçons',
  addTrain:  'Cliquez sur un tronçon pour placer le train',
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const SESSION_KEY = 'prs-session-code';

function buildPayloadFromStore(): LayoutPayload {
  const s = useRailwayStore.getState();
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    nodes:         s.nodes,
    edges:         s.edges,
    zones:         s.zones,
    signals:       s.signals,
    switches:      s.switches,
    textLabels:    s.textLabels,
    pupitreLabels: s.pupitreLabels,
    routes:        s.routes,
    panelButtons:  s.panelButtons,
  };
}

function applyPayloadToStore(payload: LayoutPayload) {
  const { schemaVersion: _v, pupitreLabels, ...layoutData } = payload;
  void _v;
  useRailwayStore.getState().loadLayout(layoutData);
  useRailwayStore.setState({ pupitreLabels });
}

export function EditorClient({
  layoutId,
  initialLayoutName,
  initialPayload,
}: {
  layoutId:          string;
  initialLayoutName: string;
  initialPayload:    LayoutPayload;
}) {
  const router        = useRouter();
  const mode          = useRailwayStore(s => s.mode);
  const pendingEdge   = useRailwayStore(s => s.pendingEdge);
  const undo          = useRailwayStore(s => s.undo);
  const selection     = useRailwayStore(s => s.selection);

  useLockBodyScroll(true);
  const isNarrow = useIsNarrow();
  const [pupitreOpen, setPupitreOpen] = useState(false);
  const [propsOpen, setPropsOpen]     = useState(false);

  // Ouvre automatiquement le panneau propriétés quand on sélectionne un élément (mobile)
  useEffect(() => {
    if (isNarrow && selection) setPropsOpen(true);
  }, [selection, isNarrow]);

  const [layoutName, setLayoutName] = useState(initialLayoutName);

  // Charge le layout initial dans le store au mount.
  useEffect(() => {
    applyPayloadToStore(initialPayload);
  }, [initialPayload]);

  // ── Code de session SSE (inchangé — lié au device, pas au layout) ─────────
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  useEffect(() => {
    let code = localStorage.getItem(SESSION_KEY);
    if (!code) { code = generateCode(); localStorage.setItem(SESSION_KEY, code); }
    setSessionCode(code);
  }, []);

  function renewSession() {
    const code = generateCode();
    localStorage.setItem(SESSION_KEY, code);
    setSessionCode(code);
  }

  function copyLearnerLink() {
    if (!sessionCode) return;
    const url = `${window.location.origin}/apprenant?session=${sessionCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useSyncPublisher(sessionCode);
  useTrainerActionReceiver(sessionCode);

  // ── Sauvegarde serveur + historique ───────────────────────────────────────
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const saveSnapshot = useCallback(async (note?: string) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = buildPayloadFromStore();
      const snap = await layoutsApi.addSnapshot(layoutId, payload, note);
      setLastSavedAt(snap.createdAt);
      setSaveMsg({ kind: 'ok', text: 'Sauvegardé.' });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      const text = e instanceof ApiError ? `HTTP ${e.status}` : (e as Error).message;
      setSaveMsg({ kind: 'err', text: 'Échec : ' + text });
    } finally {
      setSaving(false);
    }
  }, [layoutId]);

  async function onRestoreSnapshot(snap: SnapshotMeta) {
    const full = await layoutsApi.getSnapshot(layoutId, snap.id);
    applyPayloadToStore(full.payload);
    await saveSnapshot(`Restauration du snapshot du ${new Date(snap.createdAt).toLocaleString('fr-FR')}`);
    setHistoryOpen(false);
  }

  async function renameThisLayout() {
    const next = prompt('Nouveau nom du layout :', layoutName);
    if (!next || next.trim() === layoutName) return;
    try {
      const updated = await layoutsApi.rename(layoutId, next.trim());
      setLayoutName(updated.name);
    } catch (e) {
      setSaveMsg({ kind: 'err', text: 'Renommage impossible : ' + (e instanceof Error ? e.message : String(e)) });
    }
  }

  // Ctrl+S → sauvegarde
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveSnapshot();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveSnapshot]);

  // ── Resizable pupitre width (inchangé) ────────────────────────────────────
  const [pupitreW, setPupitreW] = useState(DEFAULT_PUPITRE_W);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(DEFAULT_PUPITRE_W);

  useEffect(() => {
    const apply = (clientX: number) => {
      const dx = clientX - startX.current;
      setPupitreW(Math.min(MAX_PUPITRE_W, Math.max(MIN_PUPITRE_W, startW.current + dx)));
    };
    const onMove = (e: MouseEvent) => { if (dragging.current) apply(e.clientX); };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current || !e.touches[0]) return;
      e.preventDefault();
      apply(e.touches[0].clientX);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, []);

  // Ctrl+Z (inchangé)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  const edgeHint   = mode === 'addEdge' ? (pendingEdge ? 'Cliquez sur le nœud de destination — Échap pour annuler' : 'Cliquez sur le nœud de départ') : null;
  const statusHint = edgeHint ?? STATUS_HINTS[mode] ?? null;

  const onResizeStart = (clientX: number) => {
    dragging.current = true;
    startX.current = clientX;
    startW.current = pupitreW;
  };

  return (
    <div style={layout.root}>
      {/* Barre d'entête projet — au-dessus de la Toolbar existante */}
      <div style={{ ...layout.projectBar, ...(isNarrow ? layout.projectBarNarrow : {}) }}>
        <button onClick={() => router.push('/layouts')} style={layout.backBtn} title="Retour au dashboard">
          ← {isNarrow ? '' : 'Mes layouts'}
        </button>
        <button onClick={renameThisLayout} style={layout.nameBtn} title="Renommer">
          {layoutName}
        </button>
        <div style={{ flex: 1 }} />
        {saveMsg && (
          <span style={saveMsg.kind === 'ok' ? layout.okBadge : layout.errBadge}>
            {saveMsg.text}
          </span>
        )}
        {lastSavedAt && !saveMsg && !isNarrow && (
          <span style={layout.muted}>
            Dernière sauvegarde : {new Date(lastSavedAt).toLocaleTimeString('fr-FR')}
          </span>
        )}
        <button onClick={() => setHistoryOpen(true)} style={layout.secondaryBtn} title="Historique">
          {isNarrow ? '⧗' : 'Historique'}
        </button>
        <button onClick={() => saveSnapshot()} disabled={saving} style={layout.saveBtn} title="Sauvegarder (Ctrl+S)">
          {saving ? (isNarrow ? '…' : 'Sauvegarde…') : (isNarrow ? '💾' : 'Sauvegarder (Ctrl+S)')}
        </button>
      </div>

      <Toolbar
        sessionCode={sessionCode}
        onCopyLink={copyLearnerLink}
        onRenewCode={renewSession}
        linkCopied={copied}
      />

      {/* Barre de contrôle des panneaux en mobile/tablette */}
      {isNarrow && (
        <div style={layout.panelToggleBar}>
          <button onClick={() => setPupitreOpen(true)} style={layout.panelToggleBtn}>
            ☰ Pupitre
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setPropsOpen(true)} style={layout.panelToggleBtn}>
            Propriétés ☰
          </button>
        </div>
      )}

      <div style={layout.workspace}>
        {/* Pupitre : inline sur desktop, drawer sur mobile/tablette */}
        {isNarrow ? (
          pupitreOpen && (
            <>
              <div className="prs-drawer-backdrop" onClick={() => setPupitreOpen(false)} />
              <div style={{ ...layout.drawerLeft, width: 'min(86vw, 420px)' }}>
                <div style={layout.drawerHeader}>
                  <span>Pupitre</span>
                  <button onClick={() => setPupitreOpen(false)} style={layout.drawerClose} aria-label="Fermer">✕</button>
                </div>
                <div style={layout.drawerBody} className="prs-panel-fill">
                  <PupitrePanel width={Math.min(420, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 320)} />
                </div>
              </div>
            </>
          )
        ) : (
          <>
            <PupitrePanel width={pupitreW} />
            <div
              onMouseDown={(e) => { onResizeStart(e.clientX); e.preventDefault(); }}
              onTouchStart={(e) => { if (e.touches[0]) onResizeStart(e.touches[0].clientX); }}
              style={{ width: 8, cursor: 'col-resize', background: '#1e3a5f', flexShrink: 0, transition: 'background 0.15s', touchAction: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')}
              onMouseLeave={e => (e.currentTarget.style.background = '#1e3a5f')}
            />
          </>
        )}

        <div style={layout.canvas}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TcoCanvas />
            {statusHint && <div style={layout.toast}>{statusHint}</div>}
          </div>
          <SimulationPanel />
        </div>

        {/* Propriétés : inline sur desktop, drawer sur mobile/tablette */}
        {isNarrow ? (
          propsOpen && (
            <>
              <div className="prs-drawer-backdrop" onClick={() => setPropsOpen(false)} />
              <div style={{ ...layout.drawerRight, width: 'min(86vw, 320px)' }}>
                <div style={layout.drawerHeader}>
                  <span>Propriétés</span>
                  <button onClick={() => setPropsOpen(false)} style={layout.drawerClose} aria-label="Fermer">✕</button>
                </div>
                <div style={layout.drawerBody} className="prs-panel-fill">
                  <PropertiesPanel />
                </div>
              </div>
            </>
          )
        ) : (
          <PropertiesPanel />
        )}
      </div>

      {historyOpen && (
        <HistoryDrawer
          layoutId={layoutId}
          onClose={() => setHistoryOpen(false)}
          onRestore={onRestoreSnapshot}
        />
      )}
    </div>
  );
}

const layout: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100dvh',
    background: '#0a0f1e', color: 'white',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflow: 'hidden',
  },
  projectBar: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 14px', background: '#0f172a',
    borderBottom: '1px solid #1e293b', fontSize: 13,
    flexShrink: 0,
  },
  projectBarNarrow: {
    padding: '6px 8px', gap: 6,
  },
  backBtn: {
    background: 'transparent', border: 'none', color: '#60a5fa',
    cursor: 'pointer', fontSize: 13, padding: '6px 10px',
  },
  nameBtn: {
    background: 'transparent', border: '1px dashed transparent', color: '#f1f5f9',
    cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '4px 8px', borderRadius: 4,
    maxWidth: '40vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  saveBtn: {
    padding: '8px 14px', background: '#2563eb', border: 'none', borderRadius: 6,
    color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    flexShrink: 0,
  },
  secondaryBtn: {
    padding: '8px 12px', background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 13,
    flexShrink: 0,
  },
  okBadge:  { color: '#34d399', fontSize: 12 },
  errBadge: { color: '#fca5a5', fontSize: 12 },
  muted:    { color: '#64748b', fontSize: 12 },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' },
  canvas: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  toast: {
    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(15, 23, 42, 0.9)', border: '1px solid #334155',
    color: '#94a3b8', padding: '6px 16px', borderRadius: 20,
    fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none' as const,
    whiteSpace: 'nowrap', backdropFilter: 'blur(4px)',
    maxWidth: 'calc(100% - 40px)', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  panelToggleBar: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px', background: '#0a0f1e',
    borderBottom: '1px solid #1e3a5f', flexShrink: 0,
  },
  panelToggleBtn: {
    padding: '6px 10px', background: '#0f172a', border: '1px solid #334155',
    borderRadius: 5, color: '#94a3b8', cursor: 'pointer', fontSize: 12,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  },
  drawerLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    background: '#0f172a', borderRight: '1px solid #1e3a5f',
    zIndex: 100, display: 'flex', flexDirection: 'column',
    boxShadow: '4px 0 20px rgba(0,0,0,0.5)',
    animation: 'prs-fade-in 0.15s ease-out',
  },
  drawerRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    background: '#0f172a', borderLeft: '1px solid #1e3a5f',
    zIndex: 100, display: 'flex', flexDirection: 'column',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
    animation: 'prs-fade-in 0.15s ease-out',
  },
  drawerHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid #1e3a5f',
    fontSize: 13, fontWeight: 600, color: '#f1f5f9',
    flexShrink: 0, background: '#080e1a',
  },
  drawerClose: {
    background: 'transparent', border: 'none', color: '#64748b',
    cursor: 'pointer', fontSize: 18, padding: '4px 10px', lineHeight: 1,
  },
  drawerBody: {
    flex: 1, overflow: 'auto', minHeight: 0,
  },
};
