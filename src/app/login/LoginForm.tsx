'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, authApi } from '@/lib/api-client';

export function LoginForm() {
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
      <h1 style={form.title}>Connexion</h1>
      <p style={form.sub}>Simulateur PRS — espace formateur</p>

      <label style={form.label}>
        <span>Email</span>
        <input
          type="email" required autoComplete="email" autoFocus
          value={email} onChange={e => setEmail(e.target.value)}
          style={form.input}
        />
      </label>

      <label style={form.label}>
        <span>Mot de passe</span>
        <input
          type="password" required autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)}
          style={form.input}
        />
      </label>

      {error && <div style={form.error}>{error}</div>}

      <button type="submit" disabled={loading} style={form.button}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>

      <p style={form.hint}>
        Aucun compte ? Demandez au gestionnaire de la plateforme de vous créer un accès.
      </p>
    </form>
  );
}

const form: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: 14,
    width: '100%', maxWidth: 360,
    padding: 'clamp(20px, 5vw, 28px)',
    background: '#0f172a',
    border: '1px solid #1e293b', borderRadius: 10,
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
  },
  title: { margin: 0, color: '#f1f5f9', fontSize: 22, fontWeight: 600 },
  sub:   { margin: 0, marginBottom: 8, color: '#94a3b8', fontSize: 13 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, color: '#cbd5e1', fontSize: 13 },
  input: {
    padding: '10px 12px', background: '#0a0f1e', border: '1px solid #334155',
    borderRadius: 6, color: '#f1f5f9', fontSize: 16, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  },
  button: {
    marginTop: 6, padding: '12px 14px', background: '#2563eb',
    border: 'none', borderRadius: 6, color: 'white', fontSize: 15,
    fontWeight: 600, cursor: 'pointer',
  },
  error: {
    padding: '8px 10px', background: '#7f1d1d', color: '#fecaca',
    border: '1px solid #b91c1c', borderRadius: 6, fontSize: 13,
  },
  hint: { margin: 0, color: '#64748b', fontSize: 12 },
};
