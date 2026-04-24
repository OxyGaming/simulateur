'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, usersApi, type UserSummary } from '@/lib/api-client';

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function UsersDashboard({
  currentUserId, initialUsers,
}: {
  currentUserId: string;
  initialUsers:  UserSummary[];
}) {
  const router = useRouter();
  const [users, setUsers]    = useState(initialUsers);
  const [email, setEmail]    = useState('');
  const [name, setName]      = useState('');
  const [pwd, setPwd]        = useState('');
  const [busy, setBusy]      = useState(false);
  const [msg, setMsg]        = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const created = await usersApi.create({
        email:       email.trim(),
        password:    pwd,
        displayName: name.trim() || null,
      });
      setUsers(prev => [...prev, created].sort((a, b) => a.email.localeCompare(b.email)));
      setEmail(''); setName(''); setPwd('');
      setMsg({ kind: 'ok', text: `Utilisateur "${created.email}" créé.` });
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) });
    } finally { setBusy(false); }
  }

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div style={s.brand}>PRS — Simulateur</div>
        <div style={s.user}>
          <button onClick={() => router.push('/layouts')} style={s.linkBtn}>← Retour aux layouts</button>
        </div>
      </header>

      <main style={s.main}>
        <h1 style={s.h1}>Utilisateurs (formateurs)</h1>
        <p style={s.hint}>
          Tout formateur connecté peut créer de nouveaux comptes. Le mot de passe initial sera communiqué hors-ligne à l'utilisateur.
        </p>

        {msg && (
          <div style={msg.kind === 'err' ? s.errBox : s.okBox}>{msg.text}</div>
        )}

        <form onSubmit={onCreate} style={s.form}>
          <h2 style={s.h2}>Nouvel utilisateur</h2>
          <div style={s.row}>
            <label style={s.label}>
              <span style={s.labelText}>Email *</span>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                style={s.input} placeholder="prenom.nom@exemple.fr"
                autoComplete="off"
              />
            </label>
            <label style={s.label}>
              <span style={s.labelText}>Nom affiché</span>
              <input
                type="text" value={name}
                onChange={e => setName(e.target.value)}
                style={s.input} placeholder="Jean Dupont"
                autoComplete="off"
              />
            </label>
            <label style={s.label}>
              <span style={s.labelText}>Mot de passe initial *</span>
              <input
                type="text" required minLength={8} value={pwd}
                onChange={e => setPwd(e.target.value)}
                style={s.input} placeholder="≥ 8 caractères"
                autoComplete="new-password"
              />
            </label>
          </div>
          <button type="submit" disabled={busy} style={s.primary}>
            {busy ? 'Création…' : 'Créer l\'utilisateur'}
          </button>
        </form>

        <h2 style={{ ...s.h2, marginTop: 32 }}>Comptes existants ({users.length})</h2>
        <div style={s.table}>
          <div style={s.thead} className="prs-table-head">
            <div style={{ flex: 2 }}>Email</div>
            <div style={{ flex: 2 }}>Nom</div>
            <div style={{ flex: 1 }}>Créé le</div>
            <div style={{ flex: 1 }}>Dernière connexion</div>
          </div>
          {users.map(u => (
            <div key={u.id} style={s.trow} className="prs-table-row">
              <div style={{ flex: 2, wordBreak: 'break-all' }} className="prs-table-cell" data-label="Email">
                {u.email}
                {u.id === currentUserId && <span style={s.meBadge}>vous</span>}
              </div>
              <div
                style={{ flex: 2, color: u.displayName ? undefined : '#64748b' }}
                className="prs-table-cell"
                data-label="Nom"
              >
                {u.displayName || '—'}
              </div>
              <div style={{ flex: 1, color: '#94a3b8' }} className="prs-table-cell" data-label="Créé le">
                {fmtDate(u.createdAt)}
              </div>
              <div style={{ flex: 1, color: '#94a3b8' }} className="prs-table-cell" data-label="Dernière connexion">
                {fmtDate(u.lastLoginAt)}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'Cet email est déjà utilisé.';
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
    padding: 'clamp(10px, 2vw, 14px) clamp(14px, 4vw, 28px)',
    borderBottom: '1px solid #1e293b', background: '#0f172a',
    gap: 10, flexWrap: 'wrap',
  },
  brand: { fontWeight: 600, fontSize: 15 },
  user:  { display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 },
  main:  { maxWidth: 1000, margin: '0 auto', padding: 'clamp(18px, 4vw, 32px) clamp(14px, 4vw, 28px)' },
  h1:    { margin: '0 0 6px', fontSize: 'clamp(18px, 3.5vw, 22px)', fontWeight: 600 },
  h2:    { margin: '0 0 12px', fontSize: 16, fontWeight: 600 },
  hint:  { color: '#94a3b8', fontSize: 13, margin: '0 0 24px' },
  form:  {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
    padding: 'clamp(14px, 3vw, 18px)',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  row:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px, 100%),1fr))', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6 },
  labelText: { fontSize: 12, color: '#94a3b8' },
  input: {
    padding: '10px 12px', background: '#0a0f1e', border: '1px solid #334155',
    borderRadius: 6, color: '#f1f5f9', fontSize: 14, fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
  },
  primary: {
    alignSelf: 'flex-start', padding: '10px 16px', background: '#2563eb',
    border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
  },
  linkBtn: {
    background: 'transparent', border: 'none', color: '#60a5fa',
    cursor: 'pointer', fontSize: 13, padding: '6px 10px',
  },
  table: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden',
  },
  thead: {
    display: 'flex', gap: 14, padding: '10px 16px',
    background: '#0a0f1e', borderBottom: '1px solid #1e293b',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8',
  },
  trow: {
    display: 'flex', gap: 14, padding: '12px 16px',
    borderBottom: '1px solid #1e293b', fontSize: 13,
  },
  meBadge: {
    marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#60a5fa',
    background: '#172554', padding: '1px 6px', borderRadius: 4,
    textTransform: 'uppercase', letterSpacing: 0.3,
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
