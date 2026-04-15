'use client';
// useTrainerActionReceiver — côté FORMATEUR
// Reçoit les actions de l'apprenant et les applique au store canonique.
import { useEffect, useRef } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import type { LearnerActionEvent } from '@/types/sync';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const RECONNECT_FACTOR  = 1.5;

export function useTrainerActionReceiver(sessionCode: string | null) {
  const lastSeqRef   = useRef(-1);
  const destroyedRef = useRef(false);

  useEffect(() => {
    if (!sessionCode) return;

    destroyedRef.current = false;
    let es: EventSource | null = null;
    let delay = RECONNECT_BASE_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyedRef.current) return;
      es = new EventSource(`/api/sync/trainer-stream?session=${encodeURIComponent(sessionCode)}`);

      es.onopen = () => { delay = RECONNECT_BASE_MS; };

      es.onmessage = (event: MessageEvent<string>) => {
        let parsed: LearnerActionEvent;
        try { parsed = JSON.parse(event.data) as LearnerActionEvent; }
        catch { return; }

        if (lastSeqRef.current !== -1 && parsed.seq !== lastSeqRef.current + 1) {
          console.warn(`[SSE action] écart séquence : attendu ${lastSeqRef.current + 1}, reçu ${parsed.seq}`);
        }
        lastSeqRef.current = parsed.seq;

        const store = useRailwayStore.getState();
        switch (parsed.action.type) {
          case 'pressButton':
            store.pressButton(parsed.action.buttonId);
            break;
          case 'updateReflexion':
            store.updatePanelButton(parsed.action.buttonId, { reflexions: parsed.action.reflexions });
            break;
        }
      };

      es.onerror = () => {
        es?.close(); es = null;
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
  }, [sessionCode]);
}
