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

  return (
    <div style={layout.root}>
      {/* Barre d'entête projet — au-dessus de la Toolbar existante */}
      <div style={layout.projectBar}>
        <button onClick={() => router.push('/layouts')} style={layout.backBtn} title="Retour au dashboard">
          ← Mes layouts
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
        {lastSavedAt && !saveMsg && (
          <span style={layout.muted}>
            Dernière sauvegarde : {new Date(lastSavedAt).toLocaleTimeString('fr-FR')}
          </span>
        )}
        <button onClick={() => setHistoryOpen(true)} style={layout.secondaryBtn}>
          Historique
        </button>
        <button onClick={() => saveSnapshot()} disabled={saving} style={layout.saveBtn}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder (Ctrl+S)'}
        </button>
      </div>

      <Toolbar
        sessionCode={sessionCode}
        onCopyLink={copyLearnerLink}
        onRenewCode={renewSession}
        linkCopied={copied}
      />

      <div style={layout.workspace}>
        <PupitrePanel width={pupitreW} />

        <div
          onMouseDown={(e) => { dragging.current = true; startX.current = e.clientX; startW.current = pupitreW; e.preventDefault(); }}
          style={{ width: 5, cursor: 'col-resize', background: '#1e3a5f', flexShrink: 0, transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#3b82f6')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1e3a5f')}
        />

        <div style={layout.canvas}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TcoCanvas />
            {statusHint && <div style={layout.toast}>{statusHint}</div>}
          </div>
          <SimulationPanel />
        </div>

        <PropertiesPanel />
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
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#0a0f1e', color: 'white',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  projectBar: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 14px', background: '#0f172a',
    borderBottom: '1px solid #1e293b', fontSize: 13,
  },
  backBtn: {
    background: 'transparent', border: 'none', color: '#60a5fa',
    cursor: 'pointer', fontSize: 13, padding: '4px 8px',
  },
  nameBtn: {
    background: 'transparent', border: '1px dashed transparent', color: '#f1f5f9',
    cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '4px 8px', borderRadius: 4,
  },
  saveBtn: {
    padding: '6px 14px', background: '#2563eb', border: 'none', borderRadius: 6,
    color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  secondaryBtn: {
    padding: '6px 12px', background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 13,
  },
  okBadge:  { color: '#34d399', fontSize: 12 },
  errBadge: { color: '#fca5a5', fontSize: 12 },
  muted:    { color: '#64748b', fontSize: 12 },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvas: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  toast: {
    position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(15, 23, 42, 0.9)', border: '1px solid #334155',
    color: '#94a3b8', padding: '6px 16px', borderRadius: 20,
    fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none' as const,
    whiteSpace: 'nowrap', backdropFilter: 'blur(4px)',
  },
};
