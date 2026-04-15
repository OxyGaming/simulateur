'use client';
// useSyncPublisher — côté FORMATEUR
// Observe le store Zustand et envoie un snapshot au serveur toutes les ~100 ms.
// Le serveur broadcast ce snapshot à tous les apprenants connectés en SSE.
import { useEffect, useRef } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import type { SyncSnapshot } from '@/types/sync';

const THROTTLE_MS = 100; // max 10 pushes/seconde

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

async function pushSnapshot(snapshot: SyncSnapshot) {
  try {
    await fetch('/api/sync/push', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(snapshot),
      keepalive: true,
    });
  } catch {
    // Erreur réseau silencieuse — la prochaine publication résoudra l'écart
  }
}

// Intervalle de re-push forcé : garantit que les apprenants qui se connectent
// en cours de session reçoivent un snapshot même si le store est statique.
const KEEPALIVE_MS = 3_000;

export function useSyncPublisher() {
  const pendingRef   = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Snapshot initial dès le montage
    pushSnapshot(extractSnapshot());

    // Re-push périodique (keepalive) : les apprenants qui se connectent
    // après le montage reçoivent toujours l'état courant via lastSnapshot du hub,
    // mais ce timer assure la mise à jour même si le store est complètement statique.
    keepaliveRef.current = setInterval(() => {
      pushSnapshot(extractSnapshot());
    }, KEEPALIVE_MS);

    // Abonnement direct au store (hors React) — aucun re-render
    const unsub = useRailwayStore.subscribe(() => {
      if (pendingRef.current) return; // déjà planifié dans la fenêtre courante
      pendingRef.current = true;
      timerRef.current = setTimeout(() => {
        pendingRef.current = false;
        pushSnapshot(extractSnapshot());
      }, THROTTLE_MS);
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
    };
  }, []);
}
