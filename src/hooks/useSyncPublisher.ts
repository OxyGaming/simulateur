'use client';
// useSyncPublisher — côté FORMATEUR
// Observe le store Zustand et envoie un snapshot au serveur toutes les ~100 ms.
import { useEffect, useRef } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import type { SyncSnapshot } from '@/types/sync';

const THROTTLE_MS  = 100;   // max 10 pushes/seconde
const KEEPALIVE_MS = 3_000; // re-push forcé si le store est statique

function extractSnapshot(): SyncSnapshot {
  const s = useRailwayStore.getState();
  return {
    nodes:                   s.nodes,
    edges:                   s.edges,
    zones:                   s.zones,
    signals:                 s.signals,
    switches:                s.switches,
    textLabels:              s.textLabels,
    pupitreLabels:           s.pupitreLabels,
    routes:                  s.routes,
    panelButtons:            s.panelButtons,
    trains:                  s.trains,
    routeInterlockingStates: s.routeInterlockingStates,
    conflictDetails:         s.conflictDetails,
    blinkPhase:              s.blinkPhase,
    diAlarmActive:           s.diAlarmActive,
    diIndicatorPos:          s.diIndicatorPos,
  };
}

async function pushSnapshot(sessionCode: string, snapshot: SyncSnapshot) {
  try {
    await fetch(`/api/sync/push?session=${encodeURIComponent(sessionCode)}`, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(snapshot),
      keepalive: true,
    });
  } catch { /* erreur réseau silencieuse */ }
}

export function useSyncPublisher(sessionCode: string | null) {
  const pendingRef   = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionCode) return;

    pushSnapshot(sessionCode, extractSnapshot());

    keepaliveRef.current = setInterval(() => {
      pushSnapshot(sessionCode, extractSnapshot());
    }, KEEPALIVE_MS);

    const unsub = useRailwayStore.subscribe(() => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      timerRef.current = setTimeout(() => {
        pendingRef.current = false;
        pushSnapshot(sessionCode, extractSnapshot());
      }, THROTTLE_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
    };
  }, [sessionCode]);
}
