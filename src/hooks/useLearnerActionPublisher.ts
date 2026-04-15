'use client';
// useLearnerActionPublisher — côté APPRENANT
// Observe les changements du store Zustand qui proviennent d'actions LOCALES
// (i.e. pas d'une mise à jour distante du formateur).
//
// Actions détectées et transmises au formateur :
//   • pressButton  → transition vers 'forming' d'un bouton
//   • updateReflexion → changement de réflexion sur un bouton
//
// Le flag isRemoteUpdate() (posé par useSyncReceiver) garantit qu'on n'envoie
// pas les mises à jour reçues du formateur comme si elles venaient de l'apprenant.
import { useEffect, useRef } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { isRemoteUpdate } from './syncFlags';
import type { LearnerAction } from '@/types/sync';
import type { PanelButton as StorePanelButton } from '@/types/railway';

async function sendAction(action: LearnerAction) {
  try {
    await fetch('/api/sync/action', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(action),
      keepalive: true,
    });
  } catch {
    // Erreur réseau silencieuse
  }
}

function reflexionsEqual(
  a: StorePanelButton['reflexions'],
  b: StorePanelButton['reflexions'],
): boolean {
  const ra = a ?? [];
  const rb = b ?? [];
  if (ra.length !== rb.length) return false;
  return ra.every((r, i) => r.slot === rb[i].slot && r.type === rb[i].type);
}

export function useLearnerActionPublisher() {
  // On conserve la référence aux panelButtons précédents pour comparer
  const prevButtonsRef = useRef<Record<string, StorePanelButton>>(
    useRailwayStore.getState().panelButtons,
  );

  useEffect(() => {
    const unsub = useRailwayStore.subscribe((state) => {
      // Si c'est une mise à jour distante (venue du formateur), on met à jour
      // la baseline de comparaison sans envoyer d'action, et on sort.
      if (isRemoteUpdate()) {
        prevButtonsRef.current = state.panelButtons;
        return;
      }

      const curr = state.panelButtons;
      const prev = prevButtonsRef.current;

      for (const id of Object.keys(curr)) {
        const currBtn = curr[id];
        const prevBtn = prev[id];
        if (!prevBtn) continue; // bouton nouvellement créé (formateur), pas une action apprenant

        // Détection d'un pressButton : transition vers 'forming'
        // (idle/conflict/registered/overregistered → forming)
        if (
          currBtn.state === 'forming' &&
          prevBtn.state !== 'forming'
        ) {
          sendAction({ type: 'pressButton', buttonId: id });
        }

        // Détection d'un changement de réflexion
        if (!reflexionsEqual(currBtn.reflexions, prevBtn.reflexions)) {
          sendAction({
            type:       'updateReflexion',
            buttonId:   id,
            reflexions: currBtn.reflexions ?? [],
          });
        }
      }

      prevButtonsRef.current = curr;
    });

    return () => unsub();
  }, []);
}
