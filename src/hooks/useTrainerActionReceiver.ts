'use client';
// useTrainerActionReceiver — côté FORMATEUR
// Ouvre une connexion SSE vers /api/sync/trainer-stream.
// Chaque action de l'apprenant est reçue et appliquée au store du formateur.
//
// Actions gérées :
//   • pressButton      → appelle store.pressButton(buttonId)
//   • updateReflexion  → appelle store.updatePanelButton(buttonId, { reflexions })
//
// Lorsque le formateur applique ces actions, le store change → useSyncPublisher
// le détecte et broadcast le nouvel état à l'apprenant : la boucle est ainsi
// cohérente et le formateur reste maître de l'état canonique.
import { useEffect, useRef } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import type { LearnerActionEvent } from '@/types/sync';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const RECONNECT_FACTOR  = 1.5;

export function useTrainerActionReceiver() {
  const lastSeqRef   = useRef(-1);
  const destroyedRef = useRef(false);

  useEffect(() => {
    destroyedRef.current = false;
    let es: EventSource | null = null;
    let delay = RECONNECT_BASE_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyedRef.current) return;
      es = new EventSource('/api/sync/trainer-stream');

      es.onmessage = (event: MessageEvent<string>) => {
        let parsed: LearnerActionEvent;
        try { parsed = JSON.parse(event.data) as LearnerActionEvent; }
        catch { return; }

        if (lastSeqRef.current !== -1 && parsed.seq !== lastSeqRef.current + 1) {
          console.warn(
            `[SSE action] écart de séquence : attendu ${lastSeqRef.current + 1}, reçu ${parsed.seq}`,
          );
        }
        lastSeqRef.current = parsed.seq;

        const store = useRailwayStore.getState();
        const { action } = parsed;

        switch (action.type) {
          case 'pressButton':
            // L'apprenant a pressé un bouton → on applique la même action
            // sur le store canonique du formateur (interlocking complet).
            store.pressButton(action.buttonId);
            break;

          case 'updateReflexion':
            // L'apprenant a changé les réflexions d'un bouton
            store.updatePanelButton(action.buttonId, { reflexions: action.reflexions });
            break;
        }
      };

      es.onopen = () => {
        delay = RECONNECT_BASE_MS;
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!destroyedRef.current) {
          reconnectTimer = setTimeout(() => {
            delay = Math.min(delay * RECONNECT_FACTOR, RECONNECT_MAX_MS);
            connect();
          }, delay);
        }
      };
    }

    connect();

    return () => {
      destroyedRef.current = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
