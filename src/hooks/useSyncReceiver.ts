'use client';
// useSyncReceiver — côté APPRENANT
// Ouvre une connexion SSE et applique les snapshots du formateur au store local.
import { useEffect, useRef, useState } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { markRemoteUpdate } from './syncFlags';
import type { SyncStateEvent } from '@/types/sync';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const RECONNECT_FACTOR  = 1.5;

export type SyncStatus = 'connecting' | 'connected' | 'disconnected';

export function useSyncReceiver(sessionCode: string | null) {
  const [status, setStatus] = useState<SyncStatus>('connecting');
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
      setStatus('connecting');
      es = new EventSource(`/api/sync/stream?session=${encodeURIComponent(sessionCode!)}`);

      es.onopen = () => { delay = RECONNECT_BASE_MS; setStatus('connected'); };

      es.onmessage = (event: MessageEvent<string>) => {
        let parsed: SyncStateEvent;
        try { parsed = JSON.parse(event.data) as SyncStateEvent; }
        catch { return; }

        if (lastSeqRef.current !== -1 && parsed.seq !== lastSeqRef.current + 1) {
          console.warn(`[SSE] écart séquence : attendu ${lastSeqRef.current + 1}, reçu ${parsed.seq}`);
        }
        lastSeqRef.current = parsed.seq;

        markRemoteUpdate(() => { useRailwayStore.setState(parsed.snapshot); });
      };

      es.onerror = () => {
        es?.close(); es = null;
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
  }, [sessionCode]);

  return { status };
}
