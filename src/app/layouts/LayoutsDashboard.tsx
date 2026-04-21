'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError, authApi, layoutsApi,
  type AuthUser, type LayoutMeta, type SharedLayoutMeta,
} from '@/lib/api-client';
import { LAYOUT_SCHEMA_VERSION, migrateLayoutPayload, type LayoutPayload } from '@/lib/schemas/layout';

function emptyPayload(): LayoutPayload {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    nodes: [], edges: [], zones: [], signals: [], switches: [],
    textLabels: [], pupitreLabels: [], routes: {}, panelButtons: {},
  };
}

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function slugifyForFile(name: string): string {
  return name.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'layout';
}

export function LayoutsDashboard({
  user, initialMine, initialShared,
}: {
  user: AuthUser;
  initialMine:   LayoutMeta[];
  initialShared: SharedLayoutMeta[];
}) {
  const router = useRouter();
  const [mine, setMine]       = useState(initialMine);
  const [shared, setShared]   = useState(initialShared);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);
  const fileInput             = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const r = await layoutsApi.list();
    setMine(r.mine);
    setShared(r.shared);
  }, []);

  async function createEmpty() {
    setBusy(true); setMsg(null);
    try {
      const { layout } = await layoutsApi.create('Nouveau layout', emptyPayload());
      router.push(`/editor/${layout.id}`);
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) });
    } finally { setBusy(false); }
  }

  async function onUploadJson(file: File) {
    setBusy(true); setMsg(null);
    try {
      const raw = JSON.parse(await file.text());
      // Si un ancien export n'a pas schemaVersion, migrateLayoutPayload l'ajoute.
      const payload = migrateLayoutPayload(raw);
      const name = file.name.replace(/\.json$/i, '') || 'Import';
      const { layout } = await layoutsApi.create(name, payload, `Import JSON depuis ${file.name}`);
      setMine(prev => [{ ...layout, snapshotCount: 1, latestSnapshotAt: layout.updatedAt }, ...prev]);
      setMsg({ kind: 'ok', text: `Layout "${name}" importé.` });
    } catch (e) {
      setMsg({ kind: 'err', text: 'Import impossible : ' + errMsg(e) });
    } finally { setBusy(false); }
  }

  async function renameRow(id: string, current: string) {
    const name = prompt('Nouveau nom du layout :', current);
    if (!name || name === current) return;
    setBusy(true);
    try {
      await layoutsApi.rename(id, name.trim());
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) });
    } finally { setBusy(false); }
  }

  async function togglePublic(l: LayoutMeta) {
    const next = l.isPublic ? 0 : 1;
    const verb = next ? 'rendre public' : 'rendre privé';
    if (!confirm(`Voulez-vous ${verb} le layout "${l.name}" ?`)) return;
    setBusy(true); setMsg(null);
    try {
      await layoutsApi.setPublic(l.id, next === 1);
      setMine(prev => prev.map(x => x.id === l.id ? { ...x, isPublic: next } : x));
      setMsg({ kind: 'ok', text: next ? `"${l.name}" est maintenant public.` : `"${l.name}" est maintenant privé.` });
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) });
    } finally { setBusy(false); }
  }

  async function removeRow(id: string, name: string) {
    if (!confirm(`Supprimer le layout "${name}" et tout son historique ? Cette action est irréversible.`)) return;
    setBusy(true);
    try {
      await layoutsApi.remove(id);
      setMine(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) });
    } finally { setBusy(false); }
  }

  async function useShared(id: string) {
    setBusy(true); setMsg(null);
    try {
      const { layout } = await layoutsApi.clone(id);
      router.push(`/editor/${layout.id}`);
    } catch (e) {
      setMsg({ kind: 'err', text: 'Clonage impossible : ' + errMsg(e) });
      setBusy(false);
    }
  }

  async function exportLayout(id: string, name: string) {
    setBusy(true); setMsg(null);
    try {
      const { latestSnapshot } = await layoutsApi.get(id);
      const blob = new Blob(
        [JSON.stringify(latestSnapshot.payload, null, 2)],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifyForFile(name)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg({ kind: 'err', text: 'Export impossible : ' + errMsg(e) });
    } finally { setBusy(false); }
  }

  async function logout() {
    await authApi.logout();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div style={s.brand}>PRS — Simulateur</div>
        <div style={s.user}>
          <button onClick={() => router.push('/users')} style={s.discreetLink} title="Gérer les utilisateurs">
            Utilisateurs
          </button>
          <span style={{ color: '#94a3b8' }}>{user.displayName || user.email}</span>
          <button onClick={logout} style={s.linkBtn}>Se déconnecter</button>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.toolbar}>
          <h1 style={s.h1}>Mes layouts</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <button disabled={busy} onClick={createEmpty} style={s.primary}>+ Nouveau layout</button>
            <button disabled={busy} onClick={() => fileInput.current?.click()} style={s.secondary}>
              Importer JSON
            </button>
            <input
              ref={fileInput} type="file" accept="application/json,.json" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) void onUploadJson(f); e.target.value = ''; }}
            />
          </div>
        </div>

        {msg && (
          <div style={msg.kind === 'err' ? s.errBox : s.okBox}>{msg.text}</div>
        )}

        {mine.length === 0 ? (
          <div style={s.empty}>
            Aucun layout. Créez-en un nouveau, ou importez un JSON existant.
          </div>
        ) : (
          <div style={s.grid}>
            {mine.map(l => (
              <div key={l.id} style={s.card}>
                <button
                  onClick={() => router.push(`/editor/${l.id}`)}
                  style={s.cardOpen}
                  title="Ouvrir dans l'éditeur"
                >
                  <div style={s.cardNameRow}>
                    <span style={s.cardName}>{l.name}</span>
                    {l.isPublic ? <span style={s.publicBadge}>Public</span> : null}
                  </div>
                  <div style={s.cardMeta}>
                    {l.snapshotCount} snapshot{l.snapshotCount > 1 ? 's' : ''}
                    {' · '}
                    modifié {fmtDate(l.latestSnapshotAt ?? l.updatedAt)}
                  </div>
                </button>
                <div style={s.cardActions}>
                  <button disabled={busy} onClick={() => renameRow(l.id, l.name)} style={s.linkBtn}>Renommer</button>
                  <button disabled={busy} onClick={() => togglePublic(l)} style={s.linkBtn}>
                    {l.isPublic ? 'Rendre privé' : 'Rendre public'}
                  </button>
                  <button disabled={busy} onClick={() => exportLayout(l.id, l.name)} style={s.linkBtn}>Exporter</button>
                  <button disabled={busy} onClick={() => removeRow(l.id, l.name)} style={{ ...s.linkBtn, color: '#fca5a5' }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={s.sectionBreak}>
          <h2 style={s.h2}>Bibliothèque partagée</h2>
          <div style={s.hint}>
            Layouts rendus publics par d'autres formateurs. Exportez puis réimportez pour créer votre propre version éditable.
          </div>
        </div>

        {shared.length === 0 ? (
          <div style={s.empty}>Aucun layout partagé pour le moment.</div>
        ) : (
          <div style={s.grid}>
            {shared.map(l => (
              <div key={l.id} style={s.card}>
                <div style={s.cardOpen}>
                  <div style={s.cardNameRow}>
                    <span style={s.cardName}>{l.name}</span>
                  </div>
                  <div style={s.cardMeta}>
                    par {l.ownerDisplayName || l.ownerEmail}
                    {' · '}
                    {l.snapshotCount} snapshot{l.snapshotCount > 1 ? 's' : ''}
                    {' · '}
                    modifié {fmtDate(l.latestSnapshotAt ?? l.updatedAt)}
                  </div>
                </div>
                <div style={s.cardActions}>
                  <button disabled={busy} onClick={() => useShared(l.id)} style={s.linkBtn}>
                    Utiliser
                  </button>
                  <button disabled={busy} onClick={() => exportLayout(l.id, l.name)} style={s.linkBtn}>
                    Exporter JSON
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    return `HTTP ${e.status}` + (e.details ? ` — ${JSON.stringify(e.details).slice(0, 200)}` : '');
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

const s: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#0a0f1e', color: '#f1f5f9',
          fontFamily: 'system-ui, -apple-system, sans-serif' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 28px', borderBottom: '1px solid #1e293b', background: '#0f172a',
  },
  brand: { fontWeight: 600, fontSize: 15, color: '#f1f5f9' },
  user:  { display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 },
  main:  { maxWidth: 1100, margin: '0 auto', padding: '32px 28px' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  h1:    { margin: 0, fontSize: 22, fontWeight: 600 },
  h2:    { margin: 0, fontSize: 18, fontWeight: 600 },
  sectionBreak: { marginTop: 36, marginBottom: 14 },
  hint:  { fontSize: 12, color: '#64748b', marginTop: 4 },
  primary: {
    padding: '8px 14px', background: '#2563eb', border: 'none', borderRadius: 6,
    color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  secondary: {
    padding: '8px 14px', background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6, color: '#f1f5f9', cursor: 'pointer', fontSize: 13,
  },
  linkBtn: {
    background: 'transparent', border: 'none', color: '#60a5fa',
    cursor: 'pointer', fontSize: 12, padding: '4px 8px',
  },
  discreetLink: {
    background: 'transparent', border: 'none', color: '#64748b',
    cursor: 'pointer', fontSize: 12, padding: '4px 8px', textDecoration: 'none',
  },
  empty: {
    padding: 40, textAlign: 'center', color: '#64748b',
    border: '1px dashed #334155', borderRadius: 8,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 },
  card: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  cardOpen: {
    textAlign: 'left', padding: '16px 18px', background: 'transparent',
    border: 'none', color: 'inherit', cursor: 'pointer', flex: 1,
  },
  cardNameRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardName: { fontSize: 15, fontWeight: 600 },
  cardMeta: { fontSize: 12, color: '#64748b' },
  publicBadge: {
    fontSize: 10, fontWeight: 600, color: '#86efac',
    background: '#064e3b', border: '1px solid #047857',
    padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  cardActions: {
    display: 'flex', gap: 4, padding: '6px 10px', flexWrap: 'wrap',
    borderTop: '1px solid #1e293b', background: '#0a0f1e',
  },
  errBox: {
    marginBottom: 16, padding: '10px 14px', background: '#7f1d1d',
    color: '#fecaca', border: '1px solid #b91c1c', borderRadius: 6, fontSize: 13,
  },
  okBox: {
    marginBottom: 16, padding: '10px 14px', background: '#064e3b',
    color: '#bbf7d0', border: '1px solid #047857', borderRadius: 6, fontSize: 13,
  },
};
