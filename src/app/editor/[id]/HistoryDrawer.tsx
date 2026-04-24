'use client';
import { useEffect, useState } from 'react';
import { ApiError, layoutsApi, type SnapshotMeta } from '@/lib/api-client';

export function HistoryDrawer({
  layoutId, onClose, onRestore,
}: {
  layoutId: string;
  onClose:  () => void;
  onRestore: (snap: SnapshotMeta) => void | Promise<void>;
}) {
  const [snaps, setSnaps]   = useState<SnapshotMeta[] | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [busy,  setBusy]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setSnaps(await layoutsApi.listSnapshots(layoutId));
      } catch (e) {
        setError(e instanceof ApiError ? `HTTP ${e.status}` : (e as Error).message);
      }
    })();
  }, [layoutId]);

  async function handleRestore(snap: SnapshotMeta) {
    if (!confirm(
      `Restaurer le snapshot du ${new Date(snap.createdAt).toLocaleString('fr-FR')} ?\n\n` +
      `Un nouveau snapshot sera créé à partir de cet état — l'historique reste intact.`,
    )) return;
    setBusy(true);
    try {
      await onRestore(snap);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.backdrop} onClick={onClose}>
      <aside style={s.drawer} onClick={e => e.stopPropagation()}>
        <header style={s.header}>
          <h2 style={s.title}>Historique</h2>
          <button onClick={onClose} style={s.closeBtn} title="Fermer">×</button>
        </header>

        <div style={s.body}>
          {error && <div style={s.err}>Erreur : {error}</div>}
          {!snaps && !error && <div style={s.muted}>Chargement…</div>}
          {snaps && snaps.length === 0 && <div style={s.muted}>Aucun snapshot.</div>}

          {snaps?.map((snap, i) => (
            <div key={snap.id} style={s.row}>
              <div style={s.rowMain}>
                <div style={s.date}>
                  {new Date(snap.createdAt).toLocaleString('fr-FR')}
                  {i === 0 && <span style={s.current}> · actuel</span>}
                </div>
                <div style={s.note}>{snap.note || <em style={s.emptyNote}>sans note</em>}</div>
                <div style={s.meta}>{(snap.sizeBytes / 1024).toFixed(1)} Ko</div>
              </div>
              {i > 0 && (
                <button
                  onClick={() => handleRestore(snap)}
                  disabled={busy}
                  style={s.restoreBtn}
                >
                  Restaurer
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
    display: 'flex', justifyContent: 'flex-end',
  },
  drawer: {
    width: 'min(440px, 92vw)', height: '100dvh', background: '#0f172a',
    borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column',
    color: '#f1f5f9',
  },
  header: {
    padding: '14px 18px', borderBottom: '1px solid #1e293b',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600 },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#94a3b8',
    fontSize: 22, cursor: 'pointer', padding: '0 8px', lineHeight: 1,
  },
  body: { flex: 1, overflowY: 'auto', padding: '10px 14px' },
  row: {
    display: 'flex', gap: 10, alignItems: 'center',
    padding: '10px 12px', background: '#0a0f1e',
    border: '1px solid #1e293b', borderRadius: 6, marginBottom: 8,
  },
  rowMain: { flex: 1, minWidth: 0 },
  date: { fontSize: 13, fontWeight: 500 },
  current: { color: '#34d399', fontSize: 11, fontWeight: 400 },
  note: { fontSize: 12, color: '#cbd5e1', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  emptyNote: { color: '#64748b' },
  meta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  restoreBtn: {
    padding: '6px 12px', background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 12,
  },
  err:   { padding: 12, background: '#7f1d1d', color: '#fecaca', borderRadius: 6, fontSize: 13 },
  muted: { padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 },
};
