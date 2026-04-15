'use client';
// useLearnerActionPublisher — côté APPRENANT
// Détecte les actions locales (pressButton, updateReflexion) et les envoie au formateur.
import { useEffect, useRef } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { isRemoteUpdate } from './syncFlags';
import type { LearnerAction } from '@/types/sync';
import type { PanelButton } from '@/types/railway';

async function sendAction(sessionCode: string, action: LearnerAction) {
  try {
    await fetch(`/api/sync/action?session=${encodeURIComponent(sessionCode)}`, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(action),
      keepalive: true,
    });
  } catch { /* erreur réseau silencieuse */ }
}

function reflexionsEqual(a: PanelButton['reflexions'], b: PanelButton['reflexions']): boolean {
  const ra = a ?? []; const rb = b ?? [];
  if (ra.length !== rb.length) return false;
  return ra.every((r, i) => r.slot === rb[i].slot && r.type === rb[i].type);
}

export function useLearnerActionPublisher(sessionCode: string | null) {
  const prevButtonsRef = useRef<Record<string, PanelButton>>(
    useRailwayStore.getState().panelButtons,
  );

  useEffect(() => {
    if (!sessionCode) return;

    const unsub = useRailwayStore.subscribe((state) => {
      if (isRemoteUpdate()) { prevButtonsRef.current = state.panelButtons; return; }

      const curr = state.panelButtons;
      const prev = prevButtonsRef.current;

      for (const id of Object.keys(curr)) {
        const currBtn = curr[id];
        const prevBtn = prev[id];
        if (!prevBtn) continue;

        if (currBtn.state === 'forming' && prevBtn.state !== 'forming') {
          sendAction(sessionCode, { type: 'pressButton', buttonId: id });
        }
        if (!reflexionsEqual(currBtn.reflexions, prevBtn.reflexions)) {
          sendAction(sessionCode, { type: 'updateReflexion', buttonId: id, reflexions: currBtn.reflexions ?? [] });
        }
      }
      prevButtonsRef.current = curr;
    });

    return () => unsub();
  }, [sessionCode]);
}
