'use client';
import { useEffect, useState } from 'react';

/**
 * Type pour l'event `beforeinstallprompt` (non standardisé dans lib.dom).
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = 'prs.installPromptDismissed';

/**
 * Bouton flottant "Installer l'application".
 *
 * Affiché uniquement si :
 *   • le navigateur a déclenché `beforeinstallprompt` (Chrome/Edge/Samsung)
 *   • l'utilisateur n'a pas déjà rejeté la suggestion
 *   • l'app n'est pas déjà en mode standalone (donc pas déjà installée)
 *
 * Sur iOS Safari, beforeinstallprompt n'existe pas — on affiche un mini hint
 * "Ajouter à l'écran d'accueil" la première visite seulement.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Déjà installée / lancée en standalone → on ne montre rien.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari : navigator.standalone (non standard)
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // Déjà rejeté ?
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS hint : si pas de beforeinstallprompt après 1.5s et ua = iOS Safari.
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) {
      const t = setTimeout(() => setShowIosHint(true), 1500);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        clearTimeout(t);
      };
    }

    // Cache si l'app est installée pendant la session.
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'dismissed') localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
    setShowIosHint(false);
  };

  if (deferred) {
    return (
      <div style={S.wrap} role="dialog" aria-label="Installer l'application">
        <span style={S.text}>Installer PRS Simulator sur cet appareil ?</span>
        <button onClick={handleInstall} style={S.primaryBtn}>Installer</button>
        <button onClick={handleDismiss} style={S.secondaryBtn} aria-label="Fermer">×</button>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div style={S.wrap} role="dialog" aria-label="Astuce d'installation">
        <span style={S.text}>
          Pour installer : appuyez sur <strong>Partager</strong> puis <strong>Ajouter à l'écran d'accueil</strong>.
        </span>
        <button onClick={handleDismiss} style={S.secondaryBtn} aria-label="Fermer">×</button>
      </div>
    );
  }

  return null;
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 2000,
    margin: '0 auto',
    maxWidth: 480,
    background: '#0d1625',
    border: '1px solid #1e3a5f',
    borderRadius: 10,
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
    color: '#cbd5e1',
    fontSize: 13,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  text: { flex: 1, lineHeight: 1.35 },
  primaryBtn: {
    padding: '6px 12px',
    background: '#0c1a2e',
    border: '1px solid #22d3ee',
    color: '#22d3ee',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
    lineHeight: 1,
  },
};
