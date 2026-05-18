'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, authApi } from '@/lib/api-client';

type Tab = 'login' | 'request';

export function LoginForm() {
  const [tab, setTab] = useState<Tab>('login');

  return (
    <div style={wrap.root}>
      <header style={wrap.header}>
        <div style={wrap.over}>SIMULATEUR PRS</div>
        <h1 style={wrap.title}>Espace formateur</h1>
        <p style={wrap.sub}>Connectez-vous pour continuer</p>
      </header>

      <div style={wrap.card}>
        <div role="tablist" style={tabs.row}>
          <button
            role="tab"
            aria-selected={tab === 'login'}
            onClick={() => setTab('login')}
            style={tabBtnStyle(tab === 'login')}
          >
            Connexion
          </button>
          <button
            role="tab"
            aria-selected={tab === 'request'}
            onClick={() => setTab('request')}
            style={tabBtnStyle(tab === 'request')}
          >
            Demande d&apos;accès
          </button>
        </div>

        <div style={wrap.body}>
          {tab === 'login' ? <LoginPanel /> : <RequestPanel onDone={() => setTab('login')} />}
        </div>
      </div>
    </div>
  );
}

// ─── Connexion ───────────────────────────────────────────────────────────────

function LoginPanel() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.login(email.trim().toLowerCase(), password);
      router.push('/layouts');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError('Erreur serveur. Réessayez.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={form.root}>
      <Field label="Adresse e-mail">
        <input
          type="email" required autoComplete="email" autoFocus
          value={email} onChange={e => setEmail(e.target.value)}
          style={form.input}
        />
      </Field>

      <Field label="Mot de passe">
        <input
          type="password" required autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
          style={form.input}
        />
      </Field>

      {error && <div style={form.error}>{error}</div>}

      <button type="submit" disabled={loading} style={form.primary}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}

// ─── Demande d'accès ─────────────────────────────────────────────────────────

function RequestPanel({ onDone }: { onDone: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [reason, setReason]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Le motif doit contenir au moins 10 caractères.');
      return;
    }

    setLoading(true);
    try {
      await authApi.requestAccess({
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim().toLowerCase(),
        password,
        reason:    reason.trim(),
      });
      setSuccess(true);
    } catch {
      setError('Erreur serveur. Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={form.successBox}>
        <div style={form.successTitle}>Demande envoyée</div>
        <p style={form.successText}>
          Votre demande a bien été enregistrée. Un administrateur l&apos;examinera
          et activera votre compte si elle est acceptée. Vous pourrez alors
          vous connecter avec l&apos;email et le mot de passe fournis.
        </p>
        <button onClick={onDone} style={form.secondary}>Retour à la connexion</button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={form.root}>
      <p style={form.notice}>
        Votre demande sera examinée par un administrateur avant activation
        de votre compte.
      </p>

      <div style={form.row2}>
        <Field label="Prénom">
          <input
            type="text" required maxLength={80}
            value={firstName} onChange={e => setFirstName(e.target.value)}
            style={form.input} placeholder="Jean"
          />
        </Field>
        <Field label="Nom">
          <input
            type="text" required maxLength={80}
            value={lastName} onChange={e => setLastName(e.target.value)}
            style={form.input} placeholder="Dupont"
          />
        </Field>
      </div>

      <Field label="Adresse e-mail">
        <input
          type="email" required autoComplete="email" maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)}
          style={form.input} placeholder="votre@email.fr"
        />
      </Field>

      <Field label="Mot de passe" hint="min. 8 caractères">
        <input
          type="password" required autoComplete="new-password" minLength={8}
          value={password} onChange={e => setPassword(e.target.value)}
          style={form.input}
        />
      </Field>

      <Field label="Confirmer le mot de passe">
        <input
          type="password" required autoComplete="new-password" minLength={8}
          value={confirm} onChange={e => setConfirm(e.target.value)}
          style={form.input}
        />
      </Field>

      <Field label="Motif de la demande" hint="min. 10 caractères">
        <textarea
          required minLength={10} maxLength={2000} rows={3}
          value={reason} onChange={e => setReason(e.target.value)}
          style={{ ...form.input, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder="Précisez votre fonction et la raison de votre demande d'accès…"
        />
      </Field>

      {error && <div style={form.error}>{error}</div>}

      <button type="submit" disabled={loading} style={form.primary}>
        {loading ? 'Envoi…' : 'Envoyer la demande'}
      </button>
    </form>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={form.label}>
      <span style={form.labelText}>
        {label}
        {hint && <span style={form.hint}> ({hint})</span>}
      </span>
      {children}
    </label>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const wrap: Record<string, React.CSSProperties> = {
  root: {
    width: '100%', maxWidth: 440,
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 28,
  },
  header: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 },
  over:   { color: '#60a5fa', fontSize: 12, fontWeight: 600, letterSpacing: 2 },
  title:  { margin: 0, color: '#f1f5f9', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 700 },
  sub:    { margin: 0, color: '#94a3b8', fontSize: 14 },
  card: {
    background: '#ffffff', borderRadius: 12,
    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
    overflow: 'hidden',
  },
  body: { padding: 'clamp(20px, 4vw, 28px)' },
};

const tabs: Record<string, React.CSSProperties> = {
  row: { display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff' },
};

// Style de chaque onglet calculé en une seule fonction : React signalait des
// warnings "shorthand + non-shorthand" quand on spreadait deux objets entre
// renders ; en produisant un seul objet avec les MÊMES clés à chaque appel,
// il n'y a plus de transition d'ensemble de clés à diffuser.
function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '16px 12px', background: 'transparent',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    color: active ? '#2563eb' : '#64748b',
    borderTopWidth: 0,    borderTopStyle: 'solid',    borderTopColor: 'transparent',
    borderRightWidth: 0,  borderRightStyle: 'solid',  borderRightColor: 'transparent',
    borderLeftWidth: 0,   borderLeftStyle: 'solid',   borderLeftColor: 'transparent',
    borderBottomWidth: 2, borderBottomStyle: 'solid',
    borderBottomColor: active ? '#2563eb' : 'transparent',
    transition: 'color 120ms, border-color 120ms',
  };
}

const form: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, color: '#0f172a', fontSize: 13 },
  labelText: { fontWeight: 600, color: '#0f172a' },
  hint:  { color: '#94a3b8', fontWeight: 400 },
  input: {
    padding: '10px 12px', background: '#fff', border: '1px solid #cbd5e1',
    borderRadius: 8, color: '#0f172a', fontSize: 14, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  },
  notice: {
    margin: 0, padding: '10px 12px', background: '#eff6ff',
    color: '#1e3a8a', fontSize: 13, borderRadius: 8,
  },
  primary: {
    marginTop: 6, padding: '12px 14px', background: '#2563eb',
    border: 'none', borderRadius: 8, color: 'white', fontSize: 15,
    fontWeight: 600, cursor: 'pointer',
  },
  secondary: {
    marginTop: 12, padding: '10px 14px', background: '#fff',
    border: '1px solid #2563eb', borderRadius: 8, color: '#2563eb',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start',
  },
  error: {
    padding: '8px 10px', background: '#fef2f2', color: '#b91c1c',
    border: '1px solid #fecaca', borderRadius: 8, fontSize: 13,
  },
  successBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    padding: '14px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0',
    borderRadius: 8,
  },
  successTitle: { fontSize: 15, fontWeight: 700, color: '#065f46', marginBottom: 6 },
  successText:  { margin: 0, color: '#065f46', fontSize: 13, lineHeight: 1.5 },
};
