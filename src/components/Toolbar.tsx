'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRailwayStore } from '@/store/useRailwayStore';
import { EditorMode } from '@/types/railway';
import { validateLayout } from '@/lib/validation';
import { useIsNarrow } from '@/hooks/useMediaQuery';

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES: { mode: EditorMode; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    mode: 'select',
    label: 'Sélection',
    shortcut: 'V',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M2 1 L2 12 L5.5 8.5 L8 13 L9.5 12.3 L7 7 L11 7 Z" />
      </svg>
    ),
  },
  {
    mode: 'addNode',
    label: 'Nœud',
    shortcut: 'Z',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7" cy="7" r="4" />
        <line x1="7" y1="1" x2="7" y2="3" />
        <line x1="7" y1="11" x2="7" y2="13" />
        <line x1="1" y1="7" x2="3" y2="7" />
        <line x1="11" y1="7" x2="13" y2="7" />
      </svg>
    ),
  },
  {
    mode: 'addEdge',
    label: 'Tronçon',
    shortcut: 'C',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="3" cy="7" r="2" />
        <circle cx="11" cy="7" r="2" />
        <line x1="5" y1="7" x2="9" y2="7" />
      </svg>
    ),
  },
  {
    mode: 'editZone',
    label: 'Zone CDV',
    shortcut: 'W',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="10" height="6" rx="2" />
        <line x1="5" y1="7" x2="9" y2="7" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    mode: 'addSignal',
    label: 'Signal',
    shortcut: 'S',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="7" cy="7" r="4" />
        <polygon points="10,7 6,5 6,9" fill="white" />
      </svg>
    ),
  },
  {
    mode: 'addSwitch',
    label: 'Aiguille',
    shortcut: 'A',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="1" y1="7" x2="7" y2="7" />
        <line x1="7" y1="7" x2="13" y2="7" />
        <line x1="7" y1="7" x2="12" y2="4" />
        <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    mode: 'addText',
    label: 'Texte',
    shortcut: 'T',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <text x="2" y="11" fontSize="11" fontFamily="monospace" fontWeight="bold">T</text>
      </svg>
    ),
  },
  {
    mode: 'addTrain',
    label: 'Train',
    shortcut: 'X',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <polygon points="1,5 9,5 13,7 9,9 1,9" />
        <line x1="3" y1="9" x2="3" y2="11" />
        <line x1="7" y1="9" x2="7" y2="11" />
      </svg>
    ),
  },
];

// ─── Notification ─────────────────────────────────────────────────────────────

type NotifType = 'error' | 'warning' | 'success';
interface Notif { type: NotifType; message: string; }

const NOTIF_STYLES: Record<NotifType, React.CSSProperties> = {
  error:   { background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5' },
  warning: { background: '#422006', border: '1px solid #92400e', color: '#fcd34d' },
  success: { background: '#052e16', border: '1px solid #14532d', color: '#86efac' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface ToolbarProps {
  sessionCode?:  string | null;
  onCopyLink?:   () => void;
  onRenewCode?:  () => void;
  linkCopied?:   boolean;
}

export function Toolbar({ sessionCode, onCopyLink, onRenewCode, linkCopied }: ToolbarProps = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notif, setNotif] = useState<Notif | null>(null);
  const isNarrow = useIsNarrow();

  const mode        = useRailwayStore(s => s.mode);
  const setMode     = useRailwayStore(s => s.setMode);
  const exportLayout = useRailwayStore(s => s.exportLayout);
  const loadLayout   = useRailwayStore(s => s.loadLayout);

  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 5000);
    return () => clearTimeout(t);
  }, [notif]);

  const handleExport = () => {
    const json = exportLayout();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'layout.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') return;

      const result = validateLayout(text);

      if (result.fatalError) {
        setNotif({ type: 'error', message: result.fatalError });
        return;
      }

      loadLayout(result.data);

      if (result.warnings.length > 0) {
        setNotif({ type: 'warning', message: result.warnings.join(' · ') });
      } else {
        const total =
          result.data.nodes.length +
          result.data.edges.length +
          result.data.zones.length +
          result.data.signals.length +
          result.data.switches.length +
          (result.data.textLabels?.length ?? 0);
        setNotif({ type: 'success', message: `Import réussi — ${total} objet(s) chargé(s).` });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ ...styles.bar, ...(isNarrow ? styles.barNarrow : {}) }}>
        {!isNarrow && (
          <>
            <span style={styles.brand}>PRS Simulator</span>
            <div style={styles.separator} />
          </>
        )}

        {MODES.map(({ mode: m, label, shortcut, icon }) => {
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={`${label} (${shortcut})`}
              style={{ ...styles.btn, ...(active ? styles.btnActive : {}) }}
            >
              <span style={styles.btnIcon}>{icon}</span>
              {!isNarrow && <span>{label}</span>}
              {!isNarrow && <kbd style={styles.kbd}>{shortcut}</kbd>}
            </button>
          );
        })}

        {!isNarrow && <div style={{ flex: 1 }} />}

        <a href="/mode-operatoire.html" target="_blank" rel="noopener noreferrer" style={styles.btnHelp} title="Ouvrir le mode opératoire">
          ?{!isNarrow && ' Aide'}
        </a>

        {/* Session code + lien apprenant */}
        {sessionCode && (
          <>
            {!isNarrow && <div style={styles.separator} />}
            {!isNarrow && <span style={styles.sessionLabel}>SESSION</span>}
            <span style={styles.sessionCode}>{sessionCode}</span>
            <button style={styles.btnCopyLink} onClick={onCopyLink} title="Copier le lien apprenant">
              {linkCopied ? '✓' : '⎘'}{!isNarrow && (linkCopied ? ' Copié !' : ' Lien apprenant')}
            </button>
            <button style={styles.btnRenew} onClick={onRenewCode} title="Générer un nouveau code de session">
              ↺
            </button>
          </>
        )}
        {!sessionCode && (
          <Link href="/apprenant" style={styles.btnApprenant} title="Ouvrir la vue apprenant">
            {isNarrow ? '👤' : 'Vue apprenant'}
          </Link>
        )}

        <button onClick={handleExport} style={styles.btnSecondary} title="Exporter en JSON">
          ↓{!isNarrow && ' Exporter'}
        </button>
        <button onClick={() => fileInputRef.current?.click()} style={styles.btnSecondary} title="Importer depuis JSON">
          ↑{!isNarrow && ' Importer'}
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />

        {!isNarrow && (
          <>
            <div style={styles.separator} />
            <span style={styles.hint}>Suppr. = supprimer · Échap = sélection</span>
          </>
        )}
      </div>

      {notif && (
        <div style={{ ...styles.notif, ...NOTIF_STYLES[notif.type] }}>
          <span>{notif.message}</span>
          <button onClick={() => setNotif(null)} style={styles.notifClose}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  bar: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#0f172a', borderBottom: '1px solid #1e3a5f', overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'thin' },
  barNarrow: { gap: 4, padding: '6px 8px' },
  brand: { color: '#4a90d9', fontWeight: 700, fontSize: 14, fontFamily: 'monospace', letterSpacing: 1, whiteSpace: 'nowrap' },
  separator: { width: 1, height: 24, background: '#1e3a5f', margin: '0 4px', flexShrink: 0 },
  btn: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' },
  btnActive: { background: '#1d4ed8', color: 'white', border: '1px solid #3b82f6' },
  btnIcon: { display: 'flex', alignItems: 'center' },
  kbd: { background: '#0f172a', border: '1px solid #334155', borderRadius: 3, padding: '0 4px', fontSize: 10, color: '#64748b', fontFamily: 'monospace' },
  btnSecondary: { padding: '5px 10px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
  btnHelp: { padding: '5px 10px', background: 'transparent', color: '#64748b', border: '1px solid #334155', borderRadius: 5, fontSize: 12, whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  btnApprenant: { padding: '5px 10px', background: '#0c1f3a', color: '#60a5fa', border: '1px solid #1e4d8c', borderRadius: 5, fontSize: 12, whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  sessionLabel: { fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2, color: '#475569', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' },
  sessionCode: { fontSize: 15, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 5, color: '#38bdf8', background: '#0f172a', border: '1px solid #1e3a5f', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' },
  btnCopyLink: { padding: '5px 12px', background: '#0c2a3a', color: '#38bdf8', border: '1px solid #0e4d6e', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' },
  btnRenew: { padding: '5px 8px', background: 'transparent', color: '#475569', border: '1px solid #334155', borderRadius: 5, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  hint: { color: '#334155', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' },
  notif: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 14px', fontSize: 12, fontFamily: 'monospace' },
  notifClose: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, fontSize: 12, padding: '0 0 0 12px' },
};
