'use client';
// useSyncReceiver — côté APPRENANT
// Ouvre une connexion SSE vers /api/sync/stream.
// Chaque snapshot reçu est appliqué directement au store Zustand local
// via setState (merge partiel — les actions/méthodes du store ne sont pas touchées).
// Le flag markRemoteUpdate() empêche useLearnerActionPublisher de renvoyer
// ces mises à jour distantes comme si elles venaient de l'apprenant.
import { useEffect, useRef, useState } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { markRemoteUpdate } from './syncFlags';
import type { SyncStateEvent } from '@/types/sync';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const RECONNECT_FACTOR  = 1.5;

export type SyncStatus = 'connecting' | 'connected' | 'disconnected';

export function useSyncReceiver() {
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const lastSeqRef  = useRef(-1);
  const destroyedRef = useRef(false);

  useEffect(() => {
    destroyedRef.current = false;
    let es: EventSource | null = null;
    let delay = RECONNECT_BASE_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyedRef.current) return;
      setStatus('connecting');
      es = new EventSource('/api/sync/stream');

      es.onopen = () => {
        delay = RECONNECT_BASE_MS;
        setStatus('connected');
      };

      es.onmessage = (event: MessageEvent<string>) => {
        let parsed: SyncStateEvent;
        try { parsed = JSON.parse(event.data) as SyncStateEvent; }
        catch { return; }

        if (lastSeqRef.current !== -1 && parsed.seq !== lastSeqRef.current + 1) {
          console.warn(
            `[SSE état] écart de séquence : attendu ${lastSeqRef.current + 1}, reçu ${parsed.seq}`,
          );
        }
        lastSeqRef.current = parsed.seq;

        // Applique le snapshot au store local de l'apprenant.
        // Le flag évite que useLearnerActionPublisher ne renvoie ces changements.
        markRemoteUpdate(() => {
          useRailwayStore.setState(parsed.snapshot);
        });
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!destroyedRef.current) {
          setStatus('disconnected');
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

  return { status };
}
