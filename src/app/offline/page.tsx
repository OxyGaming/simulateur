/**
 * Page de secours servie par le service worker quand une navigation échoue
 * en l'absence de connectivité et que la version cachée n'existe pas non plus.
 *
 * Doit rester 100% statique (pas d'appel API, pas de session) pour être
 * disponible offline.
 */
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main style={S.main}>
      <div style={S.card}>
        <div style={S.icon} aria-hidden>⚠</div>
        <h1 style={S.title}>Hors ligne</h1>
        <p style={S.text}>
          Cette page n'est pas disponible sans connexion réseau. Vérifiez votre connexion
          puis rechargez l'application.
        </p>
        <p style={S.muted}>
          Les pages déjà visitées restent accessibles depuis le cache.
        </p>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0f1e',
    color: '#f1f5f9',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#0d1625',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '28px 24px',
    textAlign: 'center',
  },
  icon: {
    fontSize: 40,
    color: '#f59e0b',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 12px',
    color: '#22d3ee',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 1.5,
    color: '#cbd5e1',
    margin: '0 0 12px',
  },
  muted: {
    fontSize: 12,
    color: '#64748b',
    margin: 0,
  },
};
